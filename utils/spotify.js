const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config');
const { log, error } = require('./utils');
var expiryDate = new Date();

let spotifyApi;

async function init() {
    if (!spotifyApi) {
        spotifyApi = new SpotifyWebApi({
            clientId: config.spotifyClientID,
            clientSecret: config.spotifyClientSecret,
            accessToken: config.spotifyAccessToken,
        });
        spotifyApi.setRefreshToken(config.spotifyRefreshToken)
        await refreshToken()
        setInterval(async () => {
            await refreshToken()
        }, 3500000);

    }

    return spotifyApi;
}
const refreshToken = async () => {
    await spotifyApi.refreshAccessToken().then(
        function (data) {
            log('The access token has been refreshed!');
            spotifyApi.setAccessToken(data.body['access_token']);
            log("access", data.body['access_token'])
            expiryDate = new Date()
            expiryDate.setSeconds(expiryDate.getSeconds() + 3300)
        },
        function (err) {
            error('Could not refresh access token', err);
        }
    );
}

const getAllPlaylistSongs = async (id) => {
    var data = await spotifyApi.getPlaylistTracks(id);
    var numBatches = Math.floor(data.body.total / 100) + 1;
    var promises = [];
    for (let batchNum = 0; batchNum < numBatches; batchNum++) {
        var promise = getSongs(id, batchNum * 100);
        promises.push(promise);
    }
    var rawSongData = await Promise.all(promises);
    var songs = [];
    for (let i = 0; i < rawSongData.length; i++) {
        songs = songs.concat(rawSongData[i].body.items);
    }
    return songs;
}

const getSongs = async (id, offset) => {
    var songs = await spotifyApi.getPlaylistTracks(id, { offset: offset });
    return songs;
}

const addAllTracksToPlaylist = async (playlistId, trackUris) => {
    const numBatches = Math.ceil(trackUris.length / 100);
    const promises = [];

    for (let batchNum = 0; batchNum < numBatches; batchNum++) {
        const start = batchNum * 100;
        const end = Math.min(start + 100, trackUris.length);
        const batch = trackUris.slice(start, end);
        const promise = addTracks(playlistId, batch);
        promises.push(promise);
    }

    await Promise.all(promises);
}

const addTracks = async (playlistId, trackUris) => {
    await spotifyApi.addTracksToPlaylist(playlistId, trackUris);
}
module.exports = {
    spotify: init,
    getAllPlaylistSongs,
    addAllTracksToPlaylist
};