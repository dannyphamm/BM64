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
const ADD_CHUNK_SIZE = 20;
const CLEAR_CHUNK_SIZE = 20;

let accessToken = null;
let tokenExpiresAt = 0;
let sessionId = config.tidalPrivateSessionId || null;
let countryCode = config.tidalCountryCode || 'AU';
let refreshInterval = null;

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

async function searchTracks(query) {
    const { data } = await tidalRequest('GET', 'search', {
        params: {
            query: query.trim(),
            types: 'tracks',
            limit: 1,
            offset: 0,
        },
    });

    const rawTracks = data?.tracks?.items || data?.tracks || [];
    if (!rawTracks.length) return null;

    const first = rawTracks[0];
    const track = first.item || first;
    if (!track?.id) return null;

    return parseTrack(track);
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
            songs.push({
                id: String(track.id),
                name: track.title,
            });
        }

        if (items.length < 100) break;
        offset += items.length;
    }

    return songs;
}

/**
 * Add a track to a playlist.
 * @param {number} [position] - Insert index. Omit to append. Use 0 to prepend.
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

    await tidalRequest('POST', `playlists/${playlistId}/items`, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(etag ? { 'If-None-Match': etag } : {}),
        },
        data: new URLSearchParams(body).toString(),
        params: { limit: 100 },
    });
}

/**
 * Main playlist: append (normal order).
 * Sister playlist: clear + rebuild newest-first from main (for Tesla).
 */
async function addTrackToPlaylists(trackId) {
    await addTrackToPlaylist(config.tidalPrivatePlaylist, trackId);
    if (config.tidalSisterPlaylist) {
        const songs = await getAllPlaylistSongs(config.tidalPrivatePlaylist);
        await rebuildPlaylistNewestFirst(config.tidalSisterPlaylist, songs);
    }
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

/**
 * Build inverted order reliably: walk main order (oldest→newest) and prepend each.
 * Batch add can scramble order on Tidal's API.
 */
async function addTracksNewestFirst(playlistId, songsOldestFirst) {
    log(`Tidal: adding ${songsOldestFirst.length} tracks newest-first to ${playlistId}`);
    for (let i = 0; i < songsOldestFirst.length; i++) {
        await addTrackToPlaylist(playlistId, songsOldestFirst[i].id, 0);
        if ((i + 1) % 25 === 0 || i + 1 === songsOldestFirst.length) {
            log(`Tidal: ${i + 1}/${songsOldestFirst.length}`);
        }
    }
}

async function clearPlaylist(playlistId) {
    while (true) {
        const songs = await getAllPlaylistSongs(playlistId);
        if (!songs.length) break;

        const count = Math.min(songs.length, CLEAR_CHUNK_SIZE);
        const indices = Array.from({ length: count }, (_, i) => i).join(',');
        const etag = await getPlaylistEtag(playlistId);

        await tidalRequest('DELETE', `playlists/${playlistId}/items/${indices}`, {
            headers: etag ? { 'If-None-Match': etag } : {},
        });
    }
}

/**
 * Rebuild playlist so the first song in songsOldestFirst ends up last
 * (newest / last-added is song #1).
 */
async function rebuildPlaylistNewestFirst(playlistId, songsOldestFirst) {
    log(`Tidal: rebuilding playlist ${playlistId} (${songsOldestFirst.length} tracks, newest-first)`);
    await clearPlaylist(playlistId);
    if (songsOldestFirst.length) {
        await addTracksNewestFirst(playlistId, songsOldestFirst);
    }
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
    getAllPlaylistSongs,
    reversePlaylist,
    createReversedPlaylist,
    rebuildPlaylist,
    rebuildPlaylistNewestFirst,
    clearPlaylist,
    createPlaylist,
};
