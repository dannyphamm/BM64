const { spotify } = require('../utils/spotify.js');
const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle } = require('discord.js');
const { error, log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
let message;
let timeoutId;

loadSpotify = async (client) => {
    const spotifyApi = await spotify();
    const voiceChannelId = '1145310513232891955';
    // refresh token if expired



    try {
        // Get the currently playing track from the Spotify API
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();


        if (currentTrack.body) {
            if (currentTrack.body.currently_playing_type === 'track') {
                // Get the song details
                // Set the voice channel status
                const voiceChannel = await client.channels.fetch(voiceChannelId);
                if (voiceChannel && voiceChannel.type === 2) {
                    //await voiceChannel.send(`${songName} - ${artistNames}`);
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('skip')
                                .setLabel('Skip')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('remove')
                                .setLabel('Remove')
                                .setStyle(ButtonStyle.Danger),
                        );
                    
                    const current = currentTrack.body.item;
                    await socketIO().timeout(5000).emit('getQueue', async (err, data) => {
                        const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 10 });
                        let queue;
                        if(data.length === 0) {
                            queue = [[]];
                        } else {
                            queue = data[0].map((track, id) => ({
                                name: track.name,
                                artists: track.artists,
                                album: track.album
                            }));
                        }
                         
                        const tracks = recent.body.items.map(item => ({
                            name: item.track.name,
                            artists: item.track.artists.map(artist => artist.name).join(', '),
                            album: item.track.album.name,
                        }));
                        const embed = {
                            color: 0x0099ff,
                            title: 'Recently Played',
                            fields: (queue.slice(0, 4).reverse().map((track, id) => ({
                                name: "+" + 4-id  + ". " + track.name + " - " + track.artists,
                                value: track.album,
                            })).concat([{
                                name: "Playing: " + current.name + " - " + current.artists.map(artist => artist.name).join(', '),
                                value: current.album.name,
                            }])).concat(tracks.map((track, id) => ({
                                name: "-" + id - 1 + ". " + track.name + " - " + track.artists,
                                value: track.album,
                            }))),
                            timestamp: new Date(),
                        };

                        if (!message) {
                            // Create a new message if one doesn't already exist
                            message = await voiceChannel.send({
                                embeds: [embed],
                                components: [row]
                            });
                        } else {
                            // Edit the existing message with the new song details
                            await message.edit({
                                embeds: [embed],
                                components: [row]
                            });
                        }

                    })
                }

                // Check if the song has finished
                const progressMs = currentTrack.body.progress_ms;
                const durationMs = currentTrack.body.item.duration_ms;
                const remainingMs = durationMs - progressMs + 1000;
                log(progressMs, durationMs, remainingMs);
                if (remainingMs > 0) {
                    // Wait for the remaining time before calling the loadSpotify function again
                    await new Promise(resolve => { timeoutId = setTimeout(resolve, remainingMs) });
                    // Call the loadSpotify function again
                    await loadSpotify(client);
                }
            } else if (currentTrack.body.currently_playing_type === 'ad') {
                log("hit an ad")

                // Wait for 15 seconds before calling the loadSpotify function again
                await new Promise(resolve => { timeoutId = setTimeout(resolve, 15000) });
                await loadSpotify(client);
            }
        } else {
            // No track is currently playing, clear the voice channel status
            const voiceChannel = await client.channels.fetch(voiceChannelId);
            if (voiceChannel && voiceChannel.type === 2) {
                //await voiceChannel.setName('');
            }
        }
    } catch (e) {
        error(e);

    }
};

module.exports = {
    loadSpotify: function (client) {
        loadSpotify(client)
    },
}