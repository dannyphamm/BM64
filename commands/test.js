const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testcommand')
        .setDescription('BM64 Test Command'),

    async execute(interaction) {
        try {
            // create an embed
            const embed = 
            {
                title: 'Title',
                url: 'https://example.com',
                description: 'This is a test command',
                color: 0x7289da
            }
            // reply with embed
            await interaction.reply({ embeds: [embed] });
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};