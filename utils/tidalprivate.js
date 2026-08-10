const axios = require('axios');
const config = require('../config.json');
const { log, error } = require('./utils');
const {
    API_V1,
    apiHeaders,
    refreshAccessToken,
    fetchSession,
} = require('./tidalAuth');

const API_V2 = 'https://api.tidal.com/v2/';
const ADD_CHUNK_SIZE = 50;
// Tidal rejects large DELETE index lists with 400 "Invalid indices" (seen at 100).
// spotify-to-tidal and our earlier working sync use 20.
const CLEAR_CHUNK_SIZE = 20;
const RETRY_ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tidalErrorDetail(err) {
    if (!err) return '';
    if (err.response) {
        return `status=${err.response.status} data=${JSON.stringify(err.response.data)}`;
    }
    return err.message || String(err);
}

let accessToken = null;
let tokenExpiresAt = 0;
let sessionId = config.tidalPrivateSessionId || null;
let countryCode = config.tidalCountryCode || 'AU';
let refreshInterval = null;
let sisterSyncQueue = Promise.resolve();

async function ensureSession(accessTokenValue) {
    if (!sessionId) {
        const session = await fetchSession(accessTokenValue);
        sessionId = session.sessionId;
        countryCode = session.countryCode || countryCode;
    }
}

async function refreshTokens() {
    if (!config.tidalPrivateRefreshToken) {
        throw new Error('Missing tidalPrivateRefreshToken. Run: node scripts/get-tidal-token.js');
    }

    const data = await refreshAccessToken(config.tidalPrivateRefreshToken);
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    await ensureSession(accessToken);
    log('Tidal: access token refreshed');
    return accessToken;
}

async function getToken() {
    if (!accessToken || Date.now() >= tokenExpiresAt) {
        await refreshTokens();
    }
    return accessToken;
}

async function tidalRequest(method, path, options = {}) {
    const token = await getToken();
    const params = {
        sessionId,
        countryCode,
        limit: 1000,
        ...(options.params || {}),
    };

    return axios({
        method,
        url: `${options.baseUrl || API_V1}${path}`,
        headers: apiHeaders(token, options.headers || {}),
        params,
        data: options.data,
        validateStatus: options.validateStatus,
    });
}

function parseTrack(item) {
    const artists = (item.artists || [])
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(', ');
    return {
        id: String(item.id),
        name: item.title,
        artists,
    };
}

async function searchTracks(query, { limit = 1 } = {}) {
    const { data } = await tidalRequest('GET', 'search', {
        params: {
            query: query.trim(),
            types: 'tracks',
            limit,
            offset: 0,
        },
    });

    const rawTracks = data?.tracks?.items || data?.tracks || [];
    if (!rawTracks.length) return limit === 1 ? null : [];

    const tracks = [];
    for (const entry of rawTracks) {
        const track = entry.item || entry;
        if (!track?.id) continue;
        tracks.push(parseTrack(track));
    }

    if (limit === 1) return tracks[0] || null;
    return tracks;
}

/**
 * When a direct add is silently skipped (200 but no length change),
 * search for the track and try alternate IDs.
 */
async function findAlternateTrackIds(song) {
    const query = [song.name, song.artists].filter(Boolean).join(' ').trim();
    if (!query) return [];

    const results = await searchTracks(query, { limit: 5 });
    const list = Array.isArray(results) ? results : results ? [results] : [];
    const ids = [];
    const seen = new Set();
    for (const t of list) {
        if (!t?.id || seen.has(t.id)) continue;
        seen.add(t.id);
        ids.push(t);
    }
    // Prefer IDs different from the one that failed
    ids.sort((a, b) => {
        const aSame = a.id === String(song.id) ? 1 : 0;
        const bSame = b.id === String(song.id) ? 1 : 0;
        return aSame - bSame;
    });
    return ids;
}

async function getPlaylistEtag(playlistId) {
    const { headers } = await tidalRequest('GET', `playlists/${playlistId}`);
    return headers.etag || headers.ETag || null;
}

async function getAllPlaylistSongs(playlistId) {
    const songs = [];
    let offset = 0;

    while (true) {
        const { data } = await tidalRequest('GET', `playlists/${playlistId}/tracks`, {
            params: { offset, limit: 100 },
        });

        const items = data?.items || [];
        if (!items.length) break;

        for (const entry of items) {
            const track = entry.item || entry;
            songs.push(parseTrack(track));
        }

        if (items.length < 100) break;
        offset += items.length;
    }

    return songs;
}

/** Fetch a slice of playlist tracks (offset/limit). */
async function getPlaylistSongsSlice(playlistId, offset, limit) {
    const { data } = await tidalRequest('GET', `playlists/${playlistId}/tracks`, {
        params: { offset, limit },
    });
    const items = data?.items || [];
    return items.map((entry) => {
        const track = entry.item || entry;
        return {
            id: String(track.id),
            name: track.title,
        };
    });
}

/**
 * Remove everything from keepCount onward (trim a bad append tail).
 * Sizes each DELETE from an actual tracks page — totalNumberOfItems can lag
 * and cause 400 Invalid indices if we invent indices past the real end.
 */
async function trimPlaylistFrom(playlistId, keepCount) {
    let stagnant = 0;
    let iteration = 0;
    while (true) {
        iteration += 1;
        if (iteration > 500) {
            throw new Error(`trimPlaylistFrom: aborted after 500 iterations, keepCount=${keepCount}`);
        }

        const tail = await getPlaylistSongsSlice(playlistId, keepCount, CLEAR_CHUNK_SIZE);
        if (!tail.length) {
            const reported = await getPlaylistTrackCount(playlistId);
            if (reported <= keepCount) return;
            stagnant += 1;
            if (stagnant >= 3) {
                // Stale total with empty page at keepCount — treat as trimmed.
                log(
                    `Tidal: trim treating as done (empty at ${keepCount}, reported=${reported})`
                );
                return;
            }
            await sleep(500 * stagnant);
            continue;
        }

        stagnant = 0;
        const indices = Array.from({ length: tail.length }, (_, i) => keepCount + i).join(',');
        await deletePlaylistItems(playlistId, indices);
        await sleep(150);
    }
}

/**
 * Add a track to a playlist.
 * @param {number} [position] - Insert index. Omit to append. Use 0 to prepend.
 * @returns {{ status: number, data: any }}
 */
async function addTrackToPlaylist(playlistId, trackId, position) {
    const etag = await getPlaylistEtag(playlistId);
    const body = {
        onArtifactNotFound: 'SKIP',
        trackIds: String(trackId),
        onDupes: 'SKIP',
    };
    if (typeof position === 'number' && position >= 0) {
        body.toIndex = String(position);
    }

    const res = await tidalRequest('POST', `playlists/${playlistId}/items`, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(etag ? { 'If-None-Match': etag } : {}),
        },
        data: new URLSearchParams(body).toString(),
        params: { limit: 100 },
        validateStatus: () => true,
    });

    if (res.status < 200 || res.status >= 300) {
        throw new Error(
            `addTrack ${trackId} status=${res.status} data=${JSON.stringify(res.data)}`
        );
    }

    return { status: res.status, data: res.data };
}

/**
 * Clear + rebuild sister newest-first from current main playlist.
 * Skips rebuild when main and sister already have the same track count.
 */
async function syncSisterPlaylist() {
    const mainId = config.tidalPrivatePlaylist;
    const sisterId = config.tidalSisterPlaylist;
    if (!sisterId) {
        log('Tidal sister: skipped (tidalSisterPlaylist not set)');
        return { action: 'skipped', reason: 'no_sister' };
    }

    const [mainCount, sisterCount] = await Promise.all([
        getPlaylistTrackCount(mainId),
        getPlaylistTrackCount(sisterId),
    ]);
    log(`Tidal sister: counts main=${mainCount} sister=${sisterCount}`);

    if (mainCount === sisterCount) {
        log('Tidal sister: counts match — skip rebuild');
        return { action: 'skipped', reason: 'counts_match', mainCount, sisterCount };
    }

    log(`Tidal sister: sync start -> ${sisterId}`);
    const songs = await getAllPlaylistSongs(mainId);
    log(
        `Tidal sister: main snapshot count=${songs.length} ` +
        `first=${songs[0]?.id} last=${songs[songs.length - 1]?.id}`
    );

    await rebuildPlaylistNewestFirst(sisterId, songs);
    const sisterSongs = await getAllPlaylistSongs(sisterId);
    // Count-only verify: search fallbacks can replace unavailable IDs, so
    // full reverse / first-last ID checks would false-fail (use validate script for that).
    const ok = sisterSongs.length === songs.length;
    log(
        `Tidal sister: sync done count=${sisterSongs.length} expected=${songs.length} ` +
        `first=${sisterSongs[0]?.id} last=${sisterSongs[sisterSongs.length - 1]?.id} ` +
        `verified=${ok}`
    );
    if (!ok) {
        throw new Error(
            `Sister rebuild verify failed. Expected count=${songs.length}, got ${sisterSongs.length}`
        );
    }
    return { action: 'rebuilt', mainCount: songs.length, sisterCount: sisterSongs.length };
}

/** Queue sister syncs so overlapping imports don't race clears/rebuilds. */
function queueSisterSync() {
    sisterSyncQueue = sisterSyncQueue
        .then(() => syncSisterPlaylist())
        .catch((e) => {
            error(`Tidal sister: sync failed ${tidalErrorDetail(e)}`);
        });
    return sisterSyncQueue;
}

/**
 * Discord import path: append to main playlist only.
 * Sister is rebuilt on a daily cron (not on each import).
 */
async function addTrackToPlaylists(trackId) {
    const mainId = config.tidalPrivatePlaylist;

    log(`Tidal: adding track ${trackId} to main ${mainId}`);
    const { status } = await addTrackToPlaylist(mainId, trackId);
    log(`Tidal: main add ok (${trackId}) status=${status}`);
}

async function addTracksToPlaylist(playlistId, trackIds, position = -1) {
    for (let i = 0; i < trackIds.length; i += ADD_CHUNK_SIZE) {
        const chunk = trackIds.slice(i, i + ADD_CHUNK_SIZE);
        const etag = await getPlaylistEtag(playlistId);
        const body = {
            onArtifactNotFound: 'SKIP',
            trackIds: chunk.join(','),
            onDupes: 'SKIP',
        };
        if (position >= 0) {
            body.toIndex = String(position + i);
        }

        await tidalRequest('POST', `playlists/${playlistId}/items`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
            data: new URLSearchParams(body).toString(),
            params: { limit: 100 },
        });
    }
}

async function getPlaylistTrackCount(playlistId) {
    const { data } = await tidalRequest('GET', `playlists/${playlistId}/tracks`, {
        params: { offset: 0, limit: 1 },
    });
    if (typeof data?.totalNumberOfItems === 'number') {
        return data.totalNumberOfItems;
    }
    const songs = await getAllPlaylistSongs(playlistId);
    return songs.length;
}

async function deletePlaylistItems(playlistId, indices) {
    let lastErr;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const etag = await getPlaylistEtag(playlistId);
            if (!etag) {
                log(`Tidal: delete warning — no etag for ${playlistId} (attempt ${attempt})`);
            }

            const res = await tidalRequest('DELETE', `playlists/${playlistId}/items/${indices}`, {
                headers: etag ? { 'If-None-Match': etag } : {},
                validateStatus: () => true,
            });

            if (res.status >= 200 && res.status < 300) {
                return;
            }

            lastErr = new Error(
                `DELETE items/${indices} status=${res.status} data=${JSON.stringify(res.data)}`
            );
            log(`Tidal: delete chunk failed (attempt ${attempt}/${RETRY_ATTEMPTS}) ${lastErr.message}`);

            // 412 = stale etag; 429 = rate limit — refresh and retry
            if ((res.status === 412 || res.status === 429) && attempt < RETRY_ATTEMPTS) {
                await sleep(300 * attempt);
                continue;
            }
            // 400 (e.g. Invalid indices) won't succeed on retry with the same payload
            throw lastErr;
        } catch (e) {
            lastErr = e;
            const msg = e?.message || '';
            const nonRetryable =
                e?.response?.status === 400 ||
                msg.includes('"status":400') ||
                msg.includes('Invalid indices');
            if (nonRetryable || attempt >= RETRY_ATTEMPTS) break;
            log(`Tidal: delete chunk error (attempt ${attempt}/${RETRY_ATTEMPTS}) ${tidalErrorDetail(e)}`);
            await sleep(300 * attempt);
        }
    }
    throw lastErr;
}

/**
 * Build inverted order: reverse main (newest→oldest), append one track at a time.
 * After each add: log response status, verify that position; redo if invalid.
 * If add returns 200 but length doesn't grow (SKIP dupe / missing artifact),
 * search for the song and try alternate track IDs.
 */
async function addTracksNewestFirst(playlistId, songsOldestFirst) {
    const newestFirst = [...songsOldestFirst].reverse();
    log(`Tidal sister: re-adding ${newestFirst.length} tracks newest-first to ${playlistId}`);

    for (let i = 0; i < newestFirst.length; i++) {
        const song = newestFirst[i];
        const label = [song.name, song.artists].filter(Boolean).join(' — ') || song.id;
        let trackOk = false;
        let placedId = song.id;

        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
            try {
                const beforeCount = await getPlaylistTrackCount(playlistId);
                if (beforeCount > i) {
                    log(
                        `Tidal sister: trimming tail before #${i + 1} ` +
                        `(have ${beforeCount}, keep ${i})`
                    );
                    await trimPlaylistFrom(playlistId, i);
                } else if (beforeCount < i) {
                    throw new Error(
                        `Tidal sister: playlist shorter than expected before #${i + 1} ` +
                        `(have ${beforeCount}, expected ${i})`
                    );
                }

                // Candidates: original id first, then search alternates after a silent skip
                const candidates = [{ id: song.id, name: song.name, artists: song.artists }];
                if (attempt > 1) {
                    const alts = await findAlternateTrackIds(song);
                    for (const alt of alts) {
                        if (!candidates.some((c) => c.id === alt.id)) candidates.push(alt);
                    }
                    if (alts.length) {
                        log(
                            `Tidal sister: search fallback for "${label}" → ` +
                            alts.map((t) => t.id).join(', ')
                        );
                    }
                }

                let status = null;
                let count = beforeCount;
                let used = null;

                for (const candidate of candidates) {
                    log(
                        `Tidal sister: importing ${i + 1}/${newestFirst.length} ${label} ` +
                        `(try id=${candidate.id})`
                    );
                    const addResult = await addTrackToPlaylist(playlistId, candidate.id);
                    status = addResult.status;
                    log(`Tidal sister: add response ${status} for ${candidate.id}`);
                    await sleep(100);

                    count = await getPlaylistTrackCount(playlistId);
                    if (count === beforeCount + 1) {
                        used = candidate;
                        break;
                    }

                    log(
                        `Tidal sister: add did not grow playlist (status=${status} ` +
                        `count=${count} still ${beforeCount}) — likely SKIP dupe/missing`
                    );
                }

                if (!used) {
                    // First failure: next attempt will search. Same-id retries alone are useless.
                    log(
                        `Tidal sister: #${i + 1} INVALID (attempt ${attempt}/${RETRY_ATTEMPTS}) ` +
                        `status=${status} count=${count} expected=${i + 1} ` +
                        `want=${song.id} (no candidate increased length)`
                    );
                } else {
                    const atIndex = await getPlaylistSongsSlice(playlistId, i, 1);
                    const lengthOk = count === i + 1;
                    const orderOk = atIndex[0]?.id === used.id;

                    let headOk = true;
                    if (i === 0) {
                        headOk = orderOk;
                    } else if (newestFirst[0]) {
                        const head = await getPlaylistSongsSlice(playlistId, 0, 1);
                        headOk = head[0]?.id === String(newestFirst[0].id);
                    }

                    if (lengthOk && orderOk && headOk) {
                        placedId = used.id;
                        if (placedId !== song.id) {
                            log(
                                `Tidal sister: #${i + 1} placed via search ` +
                                `${song.id} → ${placedId}`
                            );
                            // Keep later head checks / final verify aligned with what we wrote
                            newestFirst[i] = { ...song, id: placedId };
                        }
                        trackOk = true;
                        break;
                    }

                    log(
                        `Tidal sister: #${i + 1} INVALID (attempt ${attempt}/${RETRY_ATTEMPTS}) ` +
                        `status=${status} count=${count} expected=${i + 1} ` +
                        `got=${atIndex[0]?.id} want=${used.id} headOk=${headOk}`
                    );
                }
            } catch (e) {
                log(
                    `Tidal sister: #${i + 1} error (attempt ${attempt}/${RETRY_ATTEMPTS}) ` +
                    tidalErrorDetail(e)
                );
            }

            if (attempt < RETRY_ATTEMPTS) {
                await trimPlaylistFrom(playlistId, i).catch((e) => {
                    log(`Tidal sister: trim after failed add: ${tidalErrorDetail(e)}`);
                });
                await sleep(400 * attempt);
            }
        }

        if (!trackOk) {
            throw new Error(
                `Tidal sister: track #${i + 1} (${song.id} "${label}") failed after ${RETRY_ATTEMPTS} attempts ` +
                `(add returned 200 but playlist did not grow — dupe or unavailable; search fallback exhausted)`
            );
        }
    }
}

async function clearPlaylist(playlistId) {
    const reportedStart = await getPlaylistTrackCount(playlistId);
    log(`Tidal sister: clearing ${playlistId} (reported=${reportedStart} tracks)`);

    let stagnant = 0;
    let iteration = 0;
    while (true) {
        iteration += 1;
        if (iteration > 500) {
            throw new Error(`clearPlaylist: aborted after 500 iterations`);
        }

        // Size DELETE from a real page of tracks. totalNumberOfItems often lags
        // after deletes (e.g. reported=121 while only ~21 remain) — using it to
        // build indices 0..99 causes 400 Invalid indices.
        const head = await getPlaylistSongsSlice(playlistId, 0, CLEAR_CHUNK_SIZE);
        const reported = await getPlaylistTrackCount(playlistId);

        if (!head.length) {
            if (reported > 0 && stagnant < 3) {
                stagnant += 1;
                log(
                    `Tidal sister: clear empty head but reported=${reported}, ` +
                    `retrying (stagnant=${stagnant})`
                );
                await sleep(500 * stagnant);
                continue;
            }
            if (reported > 0) {
                log(
                    `Tidal sister: clear treating as empty ` +
                    `(head=0 after retries, reported=${reported})`
                );
            }
            break;
        }

        const count = head.length;
        const indices = Array.from({ length: count }, (_, i) => i).join(',');
        log(
            `Tidal sister: clear chunk #${iteration} deleting indices 0-${count - 1} ` +
            `(head=${count}, reported=${reported})`
        );

        try {
            await deletePlaylistItems(playlistId, indices);
        } catch (e) {
            const msg = e?.message || '';
            if (msg.includes('Invalid indices') && count > 1) {
                const smaller = Math.max(1, Math.floor(count / 2));
                log(
                    `Tidal sister: Invalid indices at size ${count}, ` +
                    `retrying with ${smaller}`
                );
                await deletePlaylistItems(
                    playlistId,
                    Array.from({ length: smaller }, (_, i) => i).join(',')
                );
            } else {
                throw e;
            }
        }
        await sleep(150);

        const afterHead = await getPlaylistSongsSlice(playlistId, 0, CLEAR_CHUNK_SIZE);
        const afterReported = await getPlaylistTrackCount(playlistId);
        log(
            `Tidal sister: clear chunk #${iteration} done ` +
            `head ${count} -> ${afterHead.length}, reported ${reported} -> ${afterReported}`
        );

        // Progress = head page changed (length or ids) or reported total dropped.
        // Don't rely on reported alone — it often lags after deletes.
        const headKey = head.map((s) => s.id).join(',');
        const afterKey = afterHead.map((s) => s.id).join(',');
        const progressed = afterKey !== headKey || afterReported < reported;

        if (!progressed) {
            stagnant += 1;
            if (stagnant >= 3) {
                throw new Error(
                    `clearPlaylist: no progress (head=${afterHead.length}, ` +
                    `reported=${afterReported}) after ${stagnant} attempts`
                );
            }
            log(`Tidal sister: clear made no progress, retrying (stagnant=${stagnant})`);
            await sleep(500 * stagnant);
            continue;
        }

        stagnant = 0;
    }

    log(`Tidal sister: clear complete (${playlistId})`);
}

/**
 * Rebuild playlist so the first song in songsOldestFirst ends up last
 * (newest / last-added is song #1).
 */
async function rebuildPlaylistNewestFirst(playlistId, songsOldestFirst) {
    log(
        `Tidal sister: rebuild start ${playlistId} ` +
        `(${songsOldestFirst.length} tracks, newest-first)`
    );
    await clearPlaylist(playlistId);

    const afterClear = await getPlaylistTrackCount(playlistId);
    if (afterClear !== 0) {
        throw new Error(`Tidal sister: clear incomplete, still has ${afterClear} tracks`);
    }
    log('Tidal sister: verified empty, starting re-add');

    if (songsOldestFirst.length) {
        await addTracksNewestFirst(playlistId, songsOldestFirst);
    }
    log(`Tidal sister: rebuild finished ${playlistId}`);
}

/** @deprecated use rebuildPlaylistNewestFirst */
async function rebuildPlaylist(playlistId, trackIds) {
    await rebuildPlaylistNewestFirst(
        playlistId,
        [...trackIds].reverse().map((id) => ({ id }))
    );
}

/** Reverse current playlist order in place (oldest becomes last / newest becomes #1). */
async function reversePlaylist(playlistId) {
    const songs = await getAllPlaylistSongs(playlistId);
    await rebuildPlaylistNewestFirst(playlistId, songs);
    return songs.length;
}

async function createPlaylist(title, description = '') {
    const token = await getToken();
    const { data } = await axios({
        method: 'PUT',
        url: `${API_V2}my-collection/playlists/folders/create-playlist`,
        headers: apiHeaders(token),
        params: {
            name: title,
            description,
            folderId: 'root',
            countryCode,
        },
    });

    const uuid = data?.data?.uuid || data?.uuid;
    if (!uuid) {
        throw new Error(`Failed to create playlist: ${JSON.stringify(data)}`);
    }
    return uuid;
}

/**
 * Create a new playlist with the source playlist's tracks inverted
 * (newest first for Tesla).
 */
async function createReversedPlaylist(sourcePlaylistId, title, description = '') {
    const songs = await getAllPlaylistSongs(sourcePlaylistId);
    const newId = await createPlaylist(title, description);
    if (songs.length) {
        await addTracksNewestFirst(newId, songs);
    }

    // Sanity check: sister #1 should match main's last track
    const sisterSongs = await getAllPlaylistSongs(newId);
    const mainFirst = songs[0]?.id;
    const mainLast = songs[songs.length - 1]?.id;
    const sisterFirst = sisterSongs[0]?.id;
    const sisterLast = sisterSongs[sisterSongs.length - 1]?.id;
    log(`Tidal: main first=${mainFirst} last=${mainLast}`);
    log(`Tidal: sister first=${sisterFirst} last=${sisterLast}`);
    if (sisterFirst !== mainLast || sisterLast !== mainFirst) {
        throw new Error(
            `Invert failed: expected sister first=${mainLast} last=${mainFirst}, got first=${sisterFirst} last=${sisterLast}`
        );
    }

    return { playlistId: newId, trackCount: songs.length };
}

async function tidal() {
    await getToken();
    if (!refreshInterval) {
        refreshInterval = setInterval(async () => {
            try {
                await refreshTokens();
            } catch (e) {
                error('Tidal: failed to refresh access token', e);
            }
        }, 3500000);
    }
    return {
        searchTracks,
        addTrackToPlaylist,
        addTrackToPlaylists,
        getAllPlaylistSongs,
        reversePlaylist,
        createReversedPlaylist,
        rebuildPlaylist,
        rebuildPlaylistNewestFirst,
    };
}

module.exports = {
    tidal,
    searchTracks,
    addTrackToPlaylist,
    addTrackToPlaylists,
    syncSisterPlaylist,
    queueSisterSync,
    getAllPlaylistSongs,
    reversePlaylist,
    createReversedPlaylist,
    rebuildPlaylist,
    rebuildPlaylistNewestFirst,
    clearPlaylist,
    createPlaylist,
};
