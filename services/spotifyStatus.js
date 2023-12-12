const { spotify } = require('../utils/spotify.js');
const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle } = require('discord.js');
const { error, log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');

let buttons;
let remainingMs;
let progressMs;
let durationMs;
let timeoutId;
loadSpotify = async (client, clear) => {
    const spotifyApi = await spotify();
    const voiceChannelId = '1145310513232891955';
    // refresh token if expired

    if (clear) {
        clearTimeout(timeoutId);
        await new Promise(resolve => { setTimeout(resolve, 2000) });
    }


    try {
        // Get the currently playing track from the Spotify API
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
        if (durationMs === progressMs && remainingMs === 1000) {
            log("skipping, looks like we are stuck")
            await socketIO().emit('skipMusic');
        }
        if (currentTrack.body) {
            const voiceChannel = await client.channels.fetch(voiceChannelId);
            if (currentTrack.body.currently_playing_type === 'track' && currentTrack.body.is_playing) {

                // Get the song details
                // Set the voice channel status
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
                            new ButtonBuilder()
                                .setCustomId('reset')
                                .setLabel('Broken?')
                                .setDisabled(false)
                                .setStyle(ButtonStyle.Danger)
                        );

                    const current = currentTrack.body.item;
                    await socketIO().timeout(5000).emit('getQueue', null, async (data) => {
                        const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 10 });
                        let queue;
                        log(data)
                        if(!data) {
                            return
                        }
                        if (data.songs === 0) {
                            queue = [];
                        } else {
                            queue = data.songs.map((track, id) => ({
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
                        const message = await voiceChannel.messages.fetch().then(messages => messages.find(msg => msg.author.id === client.user.id));

                        const updatedNextUpEmbed = {
                            color: 0x0099ff,
                            title: 'Next Up',
                            fields: (queue.slice(0, 4).map((track, id) => ({
                                name: (1 + Number(id)) + ". " + track.name + " - " + track.artists,
                                value: track.album,
                            })))
                        }
                        const updatedCurrentEmbed = {
                            color: 0x0099ff,
                            title: 'Currently Playing',
                            fields: [{
                                name: current.name + " - " + current.artists.map(artist => artist.name).join(', '),
                                value: current.album.name,
                            }]
                        }
                        const updatedPreviousEmbed = {
                            color: 0x0099ff,
                            title: 'Previously Played',
                            fields: tracks.map((track, id) => ({
                                name: "-" + id - 1 + ". " + track.name + " - " + track.artists,
                                value: track.album,
                            })),
                            timestamp: new Date().toISOString(),
                        }

                        if (!message) {
                            await voiceChannel.send({ embeds: [updatedNextUpEmbed, updatedCurrentEmbed, updatedPreviousEmbed], components: [buttons] })
                        } else {
                            await message.edit({ embeds: [updatedNextUpEmbed, updatedCurrentEmbed, updatedPreviousEmbed], components: [buttons] })
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
                    await new Promise(resolve => { timeoutId = setTimeout(resolve, remainingMs) });
                    // Call the loadSpotify function again
                    await loadSpotify(client, true);
                }
            } else if (currentTrack.body.currently_playing_type === 'ad' || !currentTrack.body.is_playing) {
                log("hit an ad or is paused")
                // Wait for 15 seconds before calling the loadSpotify function again
                // await new Promise(resolve => { setTimeout(resolve, 15000) });

                // await loadSpotify(client, true);

                await socketIO().timeout(5000).emit('getPlayLength', null, async (data) => {
                    log(data);
                    progressMs = data?.progress_ms;
                    durationMs = data?.duration_ms;
                    remainingMs = durationMs - progressMs + 4000;
                    if (!data) {
                        log("play length not found, retrying in 3 seconds")
                        await new Promise(resolve => { setTimeout(resolve, 3000) });
                        return loadSpotify(client, true);
                    }
                    log(progressMs, durationMs, remainingMs);
                    const message = await voiceChannel.messages.fetch().then(messages => messages.find(msg => msg.author.id === client.user.id));
                    const updatedCurrentEmbed = {
                        color: 0x0099ff,
                        title: 'Currently Playing',
                        fields: [{
                            name: data?.name + " - " + data?.artist,
                            value: "Ad is currently running",
                        }]
                    }
                    if (message) {
                        await message.edit({ embeds: [updatedCurrentEmbed] })
                    }
                    if (remainingMs > 0) {
                        // Wait for the remaining time before calling the loadSpotify function again
                        await new Promise(resolve => { setTimeout(resolve, remainingMs) });
                        // Call the loadSpotify function again
                        return loadSpotify(client, true);
                    }
                });
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