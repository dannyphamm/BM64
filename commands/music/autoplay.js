const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('autoplay')
		.setDescription('Toggle autoplay'),
	async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
          const autoplay = queue.toggleAutoplay()
          return interaction.reply(`AutoPlay: \`${autoplay ? 'On' : 'Off'}\``)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
	},
};