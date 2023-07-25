const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kdrama')
        .setDescription('Kdrama commands'),

    async execute(interaction) {
        try {
            let name = ''
            if (interaction.options.getString('name')) {
                name = interaction.options.getString('name')
            }
            return interaction.reply()
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};