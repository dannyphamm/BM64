const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('skip')
		.setDescription('Skip current song'),
	async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
          const song = await queue.skip()
          return interaction.reply(`Skipped! Now playing:\n${song.name}`)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
	},
};