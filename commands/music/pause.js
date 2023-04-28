const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the music'),
    async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
            queue.pause()
            return interaction.reply(`Paused the music!`)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};