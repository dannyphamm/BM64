const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the queue'),
    async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id);
        queue.shuffle()
        return interaction.reply(`Shuffled queue`);

    },
};