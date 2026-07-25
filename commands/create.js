const { SlashCommandBuilder } = require('@discordjs/builders');
const { error, log } = require('../utils/utils');

async function createChannelWithWebhook(guild, name) {
	const channel = await guild.channels.create({
		name,
		reason: 'Needed a cool new channel',
	});
	const webhook = await channel.createWebhook({
		name: 'Snek',
		avatar: 'https://i.imgur.com/mI8XcpG.jpg',
		reason: 'Needed a cool new Webhook',
	});
	log(`Created webhook ${webhook}`);
	return channel;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('create')
		.setDescription('Create a service from BM64')
		.addSubcommand(subcommand =>
			subcommand.setName('channel').setDescription('Create a channel from BM64')
				.addStringOption(option =>
					option
						.setName('service')
						.setDescription('BM64 Service').setRequired(true).setAutocomplete(true))
		).addSubcommand(subcommand =>
			subcommand.setName('webhook').setDescription('Create a webhook from BM64')
				.addStringOption(option =>
					option.setName('webhook').setDescription('BM64 Service').setRequired(true).setAutocomplete(true))),
	async execute(interaction) {
		const type = interaction.options.getString('service');
		const webhook = interaction.options.getString('webhook');

		if (type === 'hourly-shitposts' || type === 'shaped-internet') {
			const existing = interaction.guild.channels.cache.find(c => c.name === type);
			if (existing) {
				return interaction.reply({ content: 'Channel already exists!' });
			}
			try {
				await createChannelWithWebhook(interaction.guild, type);
				return interaction.reply({ content: `Created #${type}` });
			} catch (e) {
				error(e);
				return interaction.reply({ content: 'Failed to create channel.', ephemeral: true });
			}
		}

		if (webhook === 'kdrama') {
			try {
				const created = await interaction.channel.createWebhook({
					name: 'Snek',
					avatar: 'https://i.imgur.com/mI8XcpG.jpg',
					reason: 'Needed a cool new Webhook',
				});
				log(`Created webhook ${created}`);
				return interaction.reply({ content: 'Created kdrama webhook' });
			} catch (e) {
				error(e);
				return interaction.reply({ content: 'Failed to create webhook.', ephemeral: true });
			}
		}

		return interaction.reply({ content: 'Nothing to create.', ephemeral: true });
	},
};
