const { InteractionType } = require("discord-api-types/v10");
const { log, error } = require('../utils/utils');
const { socketIO } = require("../utils/socket");
//const { spotify } = require("../utils/spotify.js");
const { loadSpotify } = require("../services/spotifyStatus");
const config = require('../config.json');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const { client } = interaction;
        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.type == InteractionType.MessageComponent) {
            if (!interaction.isButton()) return
            log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);

            if (interaction.customId.includes('autodelete')) {
                const [action, songData] = interaction.customId.split(';');
                console.log(songData)
                const song = JSON.parse(songData)
                log('DELETE', song.uri)
                let misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo)
                //let spotifyApi = await spotify();
                // await spotifyApi.removeTracksFromPlaylist(config.spotifyPlaylist, [{ uri: song.uri}]);
                await misamo.updateOne({ uri: song.uri }, { $set: { status: "Auto: removed" } });
                const button = new ButtonBuilder()
                .setCustomId(`autodelete:${songData}`)
                .setLabel('Deleted')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true); // Disable the button
    
            const row = new ActionRowBuilder()
                .addComponents(button);
                const trackId = song.uri.replace('spotify:track:', '');
            // Edit the message to say "Deleted" and update the button
            await interaction.update({ content: `**Auto Import: Deleted Song**\nhttps://open.spotify.com/track/${trackId}`, components: [row] });
            }
            if (interaction.customId === 'skip') {
                await interaction.reply({content:'Running...', ephemeral: true });
                try {
                    await socketIO().then((socket) =>
                        socket.timeout(10000).emitWithAck('skipMusic')
                    );
                    await loadSpotify(client, true);
                    await interaction.editReply({ content: 'Skipped!', ephemeral: true });
                } catch (e) {
                    error(e);
                    await interaction.editReply({ content: 'Skip failed (Spotify client timed out).', ephemeral: true }).catch(() => {});
                }
            }

            if (interaction.customId === 'remove') {
                await interaction.reply({ content: 'Running...', ephemeral: true });
                try {
                    const currentSongRaw = await socketIO().then((socket) =>
                        socket.timeout(5000).emitWithAck('getCurrentSong')
                    );
                    const currentSong = currentSongRaw?.[0] ?? currentSongRaw;
                    if (!currentSong?.name) {
                        await interaction.editReply({ content: 'Cannot remove: no track playing or ad is playing.', ephemeral: true });
                        return;
                    }
                    const result = await socketIO().then((socket) =>
                        socket.timeout(10000).emitWithAck('removeCurrentSongFromPlaylist')
                    );
                    const resolved = result?.[0] ?? result;
                    if (resolved) {
                        const misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo);
                        const updateResult = await misamo.updateOne(
                            { name: currentSong.name, artists: currentSong.artist },
                            { $set: { status: 'Auto: removed' } }
                        );
                        if (updateResult.matchedCount === 0) {
                            await misamo.updateOne(
                                { name: currentSong.name, artists: { $regex: currentSong.artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                                { $set: { status: 'Auto: removed' } }
                            );
                        }
                        log('REMOVE', currentSong.name, currentSong.artist);
                        await socketIO().then((socket) => socket.timeout(10000).emitWithAck('skipMusic'));
                        loadSpotify(client, true);
                        await interaction.editReply({ content: 'Removed from playlist and skipped!', ephemeral: true });
                    } else {
                        await interaction.editReply({ content: 'Could not remove (e.g. not playing a track from playlist).', ephemeral: true });
                    }
                } catch (e) {
                    error(e);
                    await interaction.editReply({ content: 'Remove failed.', ephemeral: true }).catch(() => {});
                }
            }

            if (interaction.customId === 'reset') {
                await interaction.reply({content:'Running...', ephemeral: true });
                try {
                    const play = await socketIO().then((socket) =>
                        socket.timeout(10000).emitWithAck('playMusic')
                    );
                    console.log(play);
                    if (play) {
                        await loadSpotify(client, true);
                    }
                    await interaction.editReply({ content: 'Reset Triggered', ephemeral: true });
                } catch (e) {
                    error(e);
                    await interaction.editReply({ content: 'Reset failed (Spotify client timed out).', ephemeral: true }).catch(() => {});
                }
            }
        }

    },
};