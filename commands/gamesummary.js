const { SlashCommandBuilder } = require('discord.js');
const { log, error } = require('../utils/utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamesummary')
        .setDescription('Get the current daily gaming summary'),
    
    async execute(interaction) {
        try {
            // Check if the function exists (it should be available if the event is loaded)
            if (typeof global.getCurrentGameStats === 'function') {
                const stats = global.getCurrentGameStats();
                await interaction.reply({ content: stats, ephemeral: false });
            } else {
                await interaction.reply({ content: 'Gaming stats function not available.', ephemeral: true });
            }
        } catch (err) {
            error('Error in gamesummary command:', err);
            await interaction.reply({ content: 'Error generating gaming summary.', ephemeral: true });
        }
    },
}; 