const { InteractionType } = require("discord-api-types/v10");

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'toggle') {
                const focusedOption = interaction.options.getFocused(true);
                let choices;
                if (focusedOption.name === 'module') {
                    choices = interaction.client.commands.map(s => {
                        if (s.data.name !== "toggle") {
                            return s.data.name
                        }
                    })
                }
                if (focusedOption.name === 'theme') {
                    choices = ['halloween', 'christmas', 'summer'];
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
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            const disabled = false;
            if (!command) return;
            try {
                if(disabled) {
                    return await interaction.reply({ content: 'This module is disabled', ephemeral: true });
                }
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    },
};