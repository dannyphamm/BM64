const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Display info about this server.')
		.addStringOption(option =>
			option.setName("name").setDescription("The name of the song to play.")

		),
	async execute(interaction) {
		const { client } = interaction;
		client.distube.play(interaction.member.voice.channel,
		 	interaction.options.getString("name")
			, {
				textChannel: interaction.channel,
			}
		 )
		 return interaction.reply(`${interaction.options.getString("name")} added!`, { ephemeral: true });
	},
};

