const { SlashCommandBuilder } = require('@discordjs/builders');
const { joinVoiceChannel } = require('@discordjs/voice');
module.exports = {
	data: new SlashCommandBuilder()
		.setName('join')
		.setDescription('test'),
	async execute(interaction) {
        joinVoiceChannel({
            channelId: interaction.member.voice.channelId,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });
        
		return interaction.reply(`Joined Channel`);
	},
};