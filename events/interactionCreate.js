const { InteractionType } = require('discord-api-types/v10');
const { log, error } = require('../utils/utils');

module.exports = {
	name: 'interactionCreate',
	async execute(interaction) {
		const { client } = interaction;
		log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);

		if (interaction.type == InteractionType.ApplicationCommandAutocomplete) {
			if (interaction.commandName === 'toggle' || interaction.commandName === 'create') {
				const focusedOption = interaction.options.getFocused(true);
				let choices;
				if (focusedOption.name === 'module') {
					choices = client.commands.map(s => {
						if (s.data.name !== 'toggle') {
							return s.data.name;
						}
					});
				}
				if (focusedOption.name === 'service') {
					choices = ['hourly-shitposts', 'shaped-internet'];
				}
				if (focusedOption.name === 'webhook') {
					choices = ['kdrama'];
				}
				choices = (choices || []).filter(element => element !== undefined);
				const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
				await interaction.respond(
					filtered.map(choice => ({ name: choice, value: choice })),
				);
			}
		}

		if (interaction.type == InteractionType.ApplicationCommand) {
			const command = client.commands.get(interaction.commandName);
			if (!command) return;
			try {
				await command.execute(interaction);
			} catch (e) {
				error(e, 'COMMAND_ERROR');
				const payload = { content: 'There was an error while executing this command!', ephemeral: true };
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(payload).catch(() => {});
				} else {
					await interaction.reply(payload).catch(() => {});
				}
			}
		}
	},
};
