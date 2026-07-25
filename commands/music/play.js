const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Play a song in your current voice channel.')
		.addStringOption(option =>
			option.setName('name').setDescription('The name of the song to play.').setRequired(true)
		),
	async execute(interaction) {
		const { client } = interaction;
		const query = interaction.options.getString('name');
		const voiceChannel = interaction.member.voice.channel;

		if (!voiceChannel) {
			return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
		}

		await client.distube.play(voiceChannel, query, {
			textChannel: interaction.channel,
			member: interaction.member,
		});
		return interaction.reply({ content: `${query} added!`, ephemeral: true });
	},
};
