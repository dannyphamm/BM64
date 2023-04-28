const { SlashCommandBuilder } = require('@discordjs/builders');

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

		),
	async execute(interaction) {
		const type = interaction.options.getString('service')
		const ch = interaction.guild.channels.cache.find(c => c.name === type)
		if (type === 'hourly-shitposts') {
			if (ch) return interaction.reply(`Channel already exists!`);;
			await interaction.guild.channels.create({
				name: type,
				reason: 'Needed a cool new channel'
			}).then((channel) => {
				channel.createWebhook({
					name: 'Snek',
					avatar: 'https://i.imgur.com/mI8XcpG.jpg',
					reason: 'Needed a cool new Webhook'
				})
					.then(webhook => console.log(`Created webhook ${webhook}`))
					.catch(console.error);
			})

		}

		if (type === 'shaped-internet') {
			if (ch) return interaction.reply(`Channel already exists!`);;
			await interaction.guild.channels.create({
				name: type,
				reason: 'Needed a cool new channel'
			}).then((channel) => {
				channel.createWebhook({
					name: 'Snek',
					avatar: 'https://i.imgur.com/mI8XcpG.jpg',
					reason: 'Needed a cool new Webhook'
				})
					.then(webhook => console.log(`Created webhook ${webhook}`))
					.catch(console.error);
			})

		}


		if (type === 'kdrama') {
				channel.createWebhook({
					name: 'Snek',
					avatar: 'https://i.imgur.com/mI8XcpG.jpg',
					reason: 'Needed a cool new Webhook'
				})
					.then(webhook => console.log(`Created webhook ${webhook}`))
					.catch(console.error);

		}
		return interaction.reply(`Created`);
	},
};