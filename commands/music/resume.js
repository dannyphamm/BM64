const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the music'),
    async execute(interaction) {
        const { client } = interaction;
        const queue = client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
            queue.resume()
            return interaction.reply(`Resumed the music!`)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};