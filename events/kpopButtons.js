const { InteractionType } = require("discord-api-types/v10");
const { log, error } = require('../utils/utils');
const { socketIO } = require("../utils/socket");
const { spotify } = require("../utils/spotify.js");
const config = require('../config.json');
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const { client } = interaction;
        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.type == InteractionType.MessageComponent) {
            if (!interaction.isButton()) return
            log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
            if (interaction.customId === 'skip') {
                await interaction.reply({content:'Running...', ephemeral: true });
                await socketIO().then((socket) => {
                    const play = socket.timeout(10000).emitWithAck('skipMusic');
                    if (play) {
                        loadSpotify(client, true)
                    }

                })

                await interaction.editReply({ content: 'Skipped!', ephemeral: true });
            }

            if (interaction.customId === 'remove') {
                await interaction.reply({content:'Running...', ephemeral: true });
                const spotifyApi = await spotify();
                const currentSong = await spotifyApi.getMyCurrentPlayingTrack();
                if (currentSong.body.currently_playing_type !== 'track') return await interaction.reply({ content: 'Cannot remove. An ad is playing!', ephemeral: true });
                const playlist = currentSong.body.context.uri.split(':')[2];
                await spotifyApi.removeTracksFromPlaylist(
                    playlist,
                    [{ uri: `spotify:track:${currentSong.body.item.id}` }])
                const misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo);
                await misamo.deleteOne({ uri: `spotify:track:${currentSong.body.item.id}` });
                await socketIO().then((socket) => {
                    const play = socket.timeout(10000).emitWithAck('skipMusic');
                    if (play) {
                        loadSpotify(client, true)
                    }
                })
                // delay and add loadSpotify



                await interaction.editReply({ content: 'Deleted!', ephemeral: true });
            }

            if (interaction.customId === 'reset') {
                await interaction.reply({content:'Running...', ephemeral: true });
                await socketIO().then(async(socket) => {
                    const play = await socket.timeout(10000).emitWithAck('playMusic');
                    console.log(play)
                    if (play) {
                        loadSpotify(client, true)
                    }
                })

                await interaction.editReply({ content: 'Reset Triggered', ephemeral: true });
            }
        }

    },
};