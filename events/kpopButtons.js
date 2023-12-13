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
                await socketIO().then((socket)=> {
                    socket.emit('skipMusic');
                })
                await loadSpotify(client, true)
                return interaction.reply({ content: 'Skipped!', ephemeral: true });
            }

            if (interaction.customId === 'remove') {
                const spotifyApi = await spotify();
                const currentSong = await spotifyApi.getMyCurrentPlayingTrack();
                if (currentSong.body.currently_playing_type !== 'track') return await interaction.reply({ content: 'Cannot remove. An ad is playing!', ephemeral: true });
                const playlist = currentSong.body.context.uri.split(':')[2];
                await spotifyApi.removeTracksFromPlaylist(
                    playlist,
                    [{ uri: `spotify:track:${currentSong.body.item.id}` }])
                const misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo);
                await misamo.deleteOne({ uri: `spotify:track:${currentSong.body.item.id}` });
                await socketIO().then((socket)=> {
                    socket.emit('skipMusic');
                })
                // delay and add loadSpotify

                await loadSpotify(client, true)

                return interaction.reply({ content: 'Deleted!', ephemeral: true });
            }

            if (interaction.customId === 'reset') {
                await socketIO().then((socket)=> {
                    socket.emit('playMusic');
                })
                await loadSpotify(client, true)
                return interaction.reply({ content: 'Reset Triggered', ephemeral: true });
            }
        }

    },
};