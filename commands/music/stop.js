const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music'),
    async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
            queue.stop()
            return interaction.reply(`Stopped the music!`)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};