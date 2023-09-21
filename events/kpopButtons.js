const { InteractionType } = require("discord-api-types/v10");
const { log, error } = require('../utils/utils');
const { socketIO } = require("../utils/socket");
const { spotify } = require("../utils/spotify,js");
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {

        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.type == InteractionType.MessageComponent) {
            if (!interaction.isButton()) return
            log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
            if (interaction.customId === 'skip') {
                socketIO().emit('skipMusic');
                await interaction.reply({ content: 'Skipped!', ephemeral: true });
            }

            if (interaction.customId === 'remove') {
                const spotifyApi = await spotify();
                const currentSong = await spotifyApi.getMyCurrentPlayingTrack();
                const playlist = currentSong.body.context.uri.split(':')[2];
                await spotifyApi.removeTracksFromPlaylist(
                    playlist,
                    [{ uri: `spotify:track:${currentSong.body.item.id}` }])
                await interaction.reply({ content: 'Deleted!', ephemeral: true });
            }
        }

    },
};