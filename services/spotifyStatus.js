const { spotify } = require('../utils/spotify.js');
const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle } = require('discord.js');
const { error, log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
let message;
let buttons;
let remainingMs;
let progressMs;
let durationMs;
loadSpotify = async (client) => {
    const spotifyApi = await spotify();
    const voiceChannelId = '1145310513232891955';
    // refresh token if expired



    try {
        // Get the currently playing track from the Spotify API
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
        if(durationMs=== progressMs && remainingMs === 1000) {
            log("skipping, looks like we are stuck")
            await socketIO().emit('skipMusic');
        }

        if (currentTrack.body) {
           
            if (currentTrack.body.currently_playing_type === 'track' && currentTrack.body.is_playing) {

                // Get the song details
                // Set the voice channel status
                const voiceChannel = await client.channels.fetch(voiceChannelId);
                if (voiceChannel && voiceChannel.type === 2) {
                    //await voiceChannel.send(`${songName} - ${artistNames}`);
                    buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('skip')
                                .setLabel('Skip')
                                .setDisabled(false)
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('remove')
                                .setLabel('Remove')
                                .setDisabled(false)
                                .setStyle(ButtonStyle.Danger),
                        );

                    const current = currentTrack.body.item;
                    await socketIO().timeout(5000).emit('getQueue', async (err, data) => {
                        const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 10 });
                        let queue;
                        if (data.length === 0) {
                            queue = [];
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
                                name: "+" + 4 - id + ". " + track.name + " - " + track.artists,
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
                                components: [buttons]
                            });
                        } else {
                            // Edit the existing message with the new song details
                            await message.edit({
                                embeds: [embed],
                                components: [buttons]
                            });
                        }

                    })
                }

                // Check if the song has finished
                progressMs = currentTrack.body.progress_ms;
                durationMs = currentTrack.body.item.duration_ms;
                remainingMs = durationMs - progressMs + 4000;
                log(progressMs, durationMs, remainingMs);
                if (remainingMs > 0) {
                    // Wait for the remaining time before calling the loadSpotify function again
                    await new Promise(resolve => { setTimeout(resolve, remainingMs) });
                    // Call the loadSpotify function again
                    await loadSpotify(client);
                }
            } else if (currentTrack.body.currently_playing_type === 'ad' || !currentTrack.body.is_playing) {
                log("hit an ad or is paused")
                // Wait for 15 seconds before calling the loadSpotify function again
                await new Promise(resolve => { setTimeout(resolve, 15000) });
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