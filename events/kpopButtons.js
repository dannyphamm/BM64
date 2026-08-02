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

                    // SpotifyControl2 returns { ok, reason? }; legacy clients may still ack true/false.
                    const callRemove = async () => {
                        const result = await socketIO().then((socket) =>
                            socket.timeout(10000).emitWithAck('removeCurrentSongFromPlaylist')
                        );
                        return result?.[0] ?? result;
                    };
                    const normalizeRemoveResult = (resolved) => {
                        if (resolved === true) return { ok: true };
                        if (resolved === false || resolved == null) return { ok: false, reason: 'ui_error' };
                        if (typeof resolved === 'object') {
                            if (resolved.ok) return { ok: true };
                            return { ok: false, reason: resolved.reason || 'ui_error' };
                        }
                        return { ok: false, reason: 'ui_error' };
                    };

                    let outcome = normalizeRemoveResult(await callRemove());
                    // One retry for flaky queue UI (panel just opened / Now playing not ready yet)
                    if (!outcome.ok && outcome.reason === 'ui_error') {
                        outcome = normalizeRemoveResult(await callRemove());
                    }

                    const skipAndRefresh = async () => {
                        await socketIO().then((socket) => socket.timeout(10000).emitWithAck('skipMusic'));
                        loadSpotify(client, true);
                    };

                    if (outcome.ok) {
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
                        await skipAndRefresh();
                        await interaction.editReply({ content: 'Removed from playlist and skipped!', ephemeral: true });
                    } else if (outcome.reason === 'not_in_playlist') {
                        // Priority-queue / Add to Queue tracks aren't on the playlist — just skip
                        log('REMOVE_SKIP_PRIO', currentSong.name, currentSong.artist);
                        await skipAndRefresh();
                        await interaction.editReply({
                            content: 'Not a playlist track (e.g. priority queue) — skipped without removing.',
                            ephemeral: true,
                        });
                    } else {
                        await interaction.editReply({ content: 'Could not remove (queue UI failed). Try again.', ephemeral: true });
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