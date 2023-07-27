const { InteractionType } = require("discord-api-types/v10");
const {log, error} = require('../utils/utils')
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.type == InteractionType.ApplicationCommandAutocomplete) {
            if (interaction.commandName === 'toggle' ||interaction.commandName === 'create') {
                const focusedOption = interaction.options.getFocused(true);
                let choices;
                if (focusedOption.name === 'module') {
                    choices = interaction.client.commands.map(s => {
                        if (s.data.name !== "toggle") {
                            return s.data.name
                        }
                    })
                }
                if (focusedOption.name === 'service') {
                    choices = ['hourly-shitposts','shaped-internet'];
                }
                if(focusedOption.name === 'webhook') {
                    choices = ['kdrama']
                }
                // Sanitize Array
                choices = choices.filter(function (element) {
                    return element !== undefined;
                });
                const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
                await interaction.respond(
                    filtered.map(choice => ({ name: choice, value: choice })),
                );
            }
        }
        // v14 interaction.type == InteractionType.ApplicationCommand
        if (interaction.type == InteractionType.ApplicationCommand) {
            const command = interaction.client.commands.get(interaction.commandName);
            const disabled = false;
            if (!command) return;
            try {
                if(disabled) {
                    return await interaction.reply({ content: 'This module is disabled', ephemeral: true });
                }
                await command.execute(interaction);
            } catch (e) {
                error(e);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    },
};