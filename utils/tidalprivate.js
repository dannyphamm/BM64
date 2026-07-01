const axios = require('axios');
const config = require('../config.json');
const { log, error } = require('./utils');
const {
    API_V1,
    apiHeaders,
    refreshAccessToken,
    fetchSession,
} = require('./tidalAuth');

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
        url: `${API_V1}${path}`,
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

async function addTrackToPlaylist(playlistId, trackId) {
    const etag = await getPlaylistEtag(playlistId);
    const headers = etag ? { 'If-None-Match': etag } : {};

    await tidalRequest('POST', `playlists/${playlistId}/items`, {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams({
            onArtifactNotFound: 'SKIP',
            trackIds: String(trackId),
            onDupes: 'SKIP',
        }).toString(),
        params: { limit: 100 },
    });
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
    return { searchTracks, addTrackToPlaylist, getAllPlaylistSongs };
}

module.exports = {
    tidal,
    searchTracks,
    addTrackToPlaylist,
    getAllPlaylistSongs,
};
