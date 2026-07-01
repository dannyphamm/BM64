const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { error } = require('../utils/utils');

function findVoiceChannel(guild, name) {
	return guild.channels.cache.find(
		(c) => c.isVoiceBased() && c.name.toLowerCase() === name.toLowerCase(),
	);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('movevoice')
		.setDescription('Move all users (not bots) from one voice channel to another')
		.addStringOption((option) =>
			option
				.setName('from')
				.setDescription('Voice channel to move users from')
				.setRequired(true))
		.addStringOption((option) =>
			option
				.setName('to')
				.setDescription('Voice channel to move users to')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
	async execute(interaction) {
		const fromName = interaction.options.getString('from');
		const toName = interaction.options.getString('to');

		const fromChannel = findVoiceChannel(interaction.guild, fromName);
		const toChannel = findVoiceChannel(interaction.guild, toName);

		if (!fromChannel) {
			return interaction.reply({
				content: `Could not find voice channel \`${fromName}\`.`,
				ephemeral: true,
			});
		}
		if (!toChannel) {
			return interaction.reply({
				content: `Could not find voice channel \`${toName}\`.`,
				ephemeral: true,
			});
		}
		if (fromChannel.id === toChannel.id) {
			return interaction.reply({
				content: 'Source and destination channels must be different.',
				ephemeral: true,
			});
		}

		const me = interaction.guild.members.me;
		if (
			!fromChannel.permissionsFor(me).has(PermissionFlagsBits.MoveMembers) ||
			!toChannel.permissionsFor(me).has(PermissionFlagsBits.Connect)
		) {
			return interaction.reply({
				content: 'I need Move Members in the source channel and Connect in the destination channel.',
				ephemeral: true,
			});
		}

		const membersToMove = fromChannel.members.filter((member) => !member.user.bot);

		if (membersToMove.size === 0) {
			return interaction.reply({
				content: `No non-bot users in **${fromChannel.name}**.`,
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		let moved = 0;
		let failed = 0;

		for (const [, member] of membersToMove) {
			try {
				await member.voice.setChannel(toChannel);
				moved++;
			} catch (e) {
				error(e, 'MOVEVOICE');
				failed++;
			}
		}

		const summary = failed > 0
			? `Moved **${moved}** user(s) from **${fromChannel.name}** to **${toChannel.name}**. **${failed}** failed.`
			: `Moved **${moved}** user(s) from **${fromChannel.name}** to **${toChannel.name}**.`;

		return interaction.editReply({ content: summary });
	},
};
