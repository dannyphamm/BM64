const { SlashCommandBuilder } = require('@discordjs/builders');
const { misamoAutoImport } = require('../../services/misamoAutoImport.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forceupdate')
        .setDescription('Force update the MiSaMo playlist with new songs from auto-import playlists'),
    async execute(interaction) {
        const { client } = interaction;
        await interaction.deferReply();
        
        try {
            await misamoAutoImport(client);
            return interaction.editReply('Successfully checked for new songs to import!');
        } catch (e) {
            return interaction.editReply(`Error: ${e.message}`);
        }
    },
};