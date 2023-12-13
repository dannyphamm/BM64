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
    const voiceChannel = await client.channels.fetch(voiceChannelId);
    // refresh token if expired

    if (clear) {
        clearTimeout(timeoutId);
        await new Promise(resolve => { setTimeout(resolve, 1500) });
    }
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

    try {
        // Get the currently playing track from the Spotify API
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
        if (durationMs === progressMs && remainingMs === 1000) {
            log("skipping, looks like we are stuck")
            await socketIO().then((socket) => {
                socket.emit('skipMusic');
            })
        }
        if (currentTrack.body) {
            if (currentTrack.body.currently_playing_type === 'track' && currentTrack.body.is_playing) {

                // Get the song details
                // Set the voice channel status
                if (voiceChannel && voiceChannel.type === 2) {
                    //await voiceChannel.send(`${songName} - ${artistNames}`);
                    

                    const current = currentTrack.body.item;
                    const response = await socketIO().then((socket) => {
                        return socket.timeout(10000).emitWithAck('getQueue');
                    })
                    
                    const data = response;
                    log(data, "Queue")
                    const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 10 });
                    let queue;
                    if (!data) {
                        log("queue not found, retrying in 3 seconds")
                        await new Promise(resolve => { setTimeout(resolve, 3000) });
                        return loadSpotify(client, true);
                    }
                    if (data[0].songs === 0) {
                        queue = [];
                    } else {
                        queue = data[0].songs.map((track, id) => ({
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
                    loadSpotify(client, true);
                }
            } else if (currentTrack.body.currently_playing_type === 'ad' || !currentTrack.body.is_playing) {
                const response1 = await socketIO().then((socket) => {
                    return socket.timeout(10000).emitWithAck('getQueue');
                })
                const next = response1;
                log(next, "AD queue")
                let queue;
                if (!next) {
                    log("queue not found, retrying in 3 seconds")
                    await new Promise(resolve => { setTimeout(resolve, 3000) });
                    return loadSpotify(client, true);
                }
                if (next[0].songs === 0) {
                    queue = [];
                } else {
                    queue = next[0].songs.map((track, id) => ({
                        name: track.name,
                        artists: track.artists,
                        album: track.album
                    }));
                }
                const updatedNextUpEmbed = {
                    color: 0x0099ff,
                    title: 'Next Up',
                    fields: (queue.slice(0, 4).map((track, id) => ({
                        name: (1 + Number(id)) + ". " + track.name + " - " + track.artists,
                        value: track.album,
                    })))
                }
                const recent = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 10 });
                const tracks = recent.body.items.map(item => ({
                    name: item.track.name,
                    artists: item.track.artists.map(artist => artist.name).join(', '),
                    album: item.track.album.name,
                }));
                const updatedPreviousEmbed = {
                    color: 0x0099ff,
                    title: 'Previously Played',
                    fields: tracks.map((track, id) => ({
                        name: "-" + id - 1 + ". " + track.name + " - " + track.artists,
                        value: track.album,
                    })),
                    timestamp: new Date().toISOString(),
                }
                log("hit an ad or is paused")
                // Wait for 15 seconds before calling the loadSpotify function again
                const response = await socketIO().then((socket) => {
                    return socket.timeout(10000).emitWithAck('getPlayLength');
                })
                const data = response[0];
                if (!response) {
                    log("play length not found, retrying in 3 seconds")
                    await new Promise(resolve => { setTimeout(resolve, 3000) });
                    return loadSpotify(client, true);
                }
                progressMs = data?.progress_ms;
                durationMs = data?.duration_ms;
                remainingMs = durationMs - progressMs + 4000;
                log(data, "AD current")
                const message = await voiceChannel.messages.fetch().then(messages => messages.find(msg => msg.author.id === client.user.id));
                const updatedCurrentEmbed = {
                    color: 0x0099ff,
                    title: 'Currently Playing',
                    fields: [{
                        name: data?.name + " - " + data?.artist,
                        value: "Ad is currently running",
                    }]
                }
                if (!message) {
                    await voiceChannel.send({ embeds: [updatedNextUpEmbed, updatedCurrentEmbed, updatedPreviousEmbed], components: [buttons] })
                } else {
                    await message.edit({ embeds: [updatedNextUpEmbed, updatedCurrentEmbed, updatedPreviousEmbed], components: [buttons] })
                }
                if (remainingMs > 0) {
                    // Wait for the remaining time before calling the loadSpotify function again
                    await new Promise(resolve => { setTimeout(resolve, remainingMs) });
                    // Call the loadSpotify function again
                    return loadSpotify(client, true);
                }

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