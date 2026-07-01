const axios = require('axios');
const config = require('../config.json');
const { log, error } = require('./utils');

const API_BASE = 'https://openapi.tidal.com/v2';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

let accessToken = null;
let tokenExpiresAt = 0;
let refreshInterval = null;

const countryCode = () => config.tidalCountryCode || 'AU';

const tidalHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
});

async function fetchClientCredentialsToken() {
    const credentials = Buffer.from(
        `${config.tidalPrivateClientID}:${config.tidalPrivateClientSecret}`
    ).toString('base64');

    const { data } = await axios.post(
        TOKEN_URL,
        'grant_type=client_credentials',
        {
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );
    return data;
}

async function refreshAccessToken() {
    if (config.tidalPrivateRefreshToken) {
        const { data } = await axios.post(
            TOKEN_URL,
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: config.tidalPrivateRefreshToken,
                client_id: config.tidalPrivateClientID,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        accessToken = data.access_token;
        tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
        log('Tidal: access token refreshed');
        return accessToken;
    }

    const data = await fetchClientCredentialsToken();
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    log('Tidal: client credentials token obtained');
    return accessToken;
}

async function getToken() {
    if (!accessToken || Date.now() >= tokenExpiresAt) {
        await refreshAccessToken();
    }
    return accessToken;
}

async function tidalRequest(method, path, options = {}) {
    const token = await getToken();
    return axios({
        method,
        url: `${API_BASE}${path}`,
        headers: tidalHeaders(token),
        ...options,
    });
}

async function searchTracks(query) {
    const encoded = encodeURIComponent(query.trim());
    const { data } = await tidalRequest('GET', `/searchResults/${encoded}`, {
        params: {
            countryCode: countryCode(),
            include: 'tracks,tracks.artists',
        },
    });

    const trackRels = data?.data?.relationships?.tracks?.data || [];
    if (!trackRels.length) return null;

    const included = data.included || [];
    const track = included.find((item) => item.type === 'tracks' && item.id === trackRels[0].id);
    if (!track) return null;

    const artistIds = track.relationships?.artists?.data?.map((artist) => artist.id) || [];
    const artists = included
        .filter((item) => item.type === 'artists' && artistIds.includes(item.id))
        .map((artist) => artist.attributes?.name)
        .filter(Boolean)
        .join(', ');

    return {
        id: track.id,
        name: track.attributes?.title,
        artists,
    };
}

async function addTrackToPlaylist(playlistId, trackId) {
    await tidalRequest('POST', `/playlists/${playlistId}/relationships/items`, {
        params: { countryCode: countryCode() },
        data: {
            data: [{ id: String(trackId), type: 'tracks' }],
        },
    });
}

async function getAllPlaylistSongs(playlistId) {
    const songs = [];
    let cursor = null;

    do {
        const params = {
            countryCode: countryCode(),
            include: 'items',
        };
        if (cursor) params['page[cursor]'] = cursor;

        const { data } = await tidalRequest(
            'GET',
            `/playlists/${playlistId}/relationships/items`,
            { params }
        );

        for (const item of data.data || []) {
            songs.push({
                id: item.meta?.itemId || item.id,
                type: item.type,
            });
        }

        cursor = data.links?.next
            ? new URL(data.links.next).searchParams.get('page[cursor]')
            : null;
    } while (cursor);

    return songs;
}

async function tidal() {
    await getToken();
    if (!refreshInterval) {
        refreshInterval = setInterval(async () => {
            try {
                await refreshAccessToken();
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
