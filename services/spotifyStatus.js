const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
var expiryDate = new Date();

const loadSpotify = async (client) => {


    const voiceChannelId = '1145310513232891955';
    var spotifyApi = new SpotifyWebApi({
        clientId: config.spotifyClientID,
        clientSecret: config.spotifyClientSecret,
        accessToken: config.spotifyAccessToken
    })
    // refresh token if expired
    spotifyApi.setRefreshToken(config.spotifyRefreshToken)
    if (new Date() >= expiryDate) {
        spotifyApi.refreshAccessToken().then(
            function (data) {
                console.log('The access token has been refreshed!');
                spotifyApi.setAccessToken(data.body['access_token']);
                spotifyApi.setRefreshToken(data.body['refresh_token']);
                expiryDate = new Date()
                expiryDate.setSeconds(expiryDate.getSeconds() + 3600)
            },
            function (err) {
                console.log('Could not refresh access token', err);
            }
        );
    }

    try {
        // Get the currently playing track from the Spotify API
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
        if (currentTrack.body) {
            if (currentTrack.body.currently_playing_type === 'track') {
                // Get the song details
                const songName = currentTrack.body.item.name;
                const artistNames = currentTrack.body.item.artists.map(artist => artist.name).join(', ');

                // Set the voice channel status
                const voiceChannel = await client.channels.fetch(voiceChannelId);
                if (voiceChannel && voiceChannel.type === 2) {
                    await voiceChannel.send(`${songName} - ${artistNames}`);
                }

                // Check if the song has finished
                const progressMs = currentTrack.body.progress_ms;
                const durationMs = currentTrack.body.item.duration_ms;
                const remainingMs = durationMs - progressMs + 1000;
                console.log(progressMs, durationMs, remainingMs);
                if (remainingMs > 0) {
                    // Wait for the remaining time before calling the loadSpotify function again
                    await new Promise(resolve => setTimeout(resolve, remainingMs));
                    // Call the loadSpotify function again
                    await loadSpotify(client);
                }
            } else if (currentTrack.body.currently_playing_type === 'ad') {
                // Wait for 15 seconds before calling the loadSpotify function again
                await new Promise(resolve => setTimeout(resolve, 15000));
                await loadSpotify(client);
            }
        } else {
            // No track is currently playing, clear the voice channel status
            const voiceChannel = await client.channels.fetch(voiceChannelId);
            if (voiceChannel && voiceChannel.type === 2) {
                //await voiceChannel.setName('');
            }
        }
    } catch (error) {
        console.error(error);
    }
};

module.exports = {
    loadSpotify: function (client) {
        loadSpotify(client)
    }
}