const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Repeat settings')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The gif category')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: '0' },
                    { name: 'Song', value: '1' },
                    { name: 'Queue', value: '2' },
                )),
    async execute(interaction) {
        const { client } = interaction;
        const queue = client.distube.getQueue(interaction.guild.id)
        if (!queue) return interaction.reply(`There is nothing in the queue right now!`)
        try {
            const choice = parseInt(interaction.options.get('type').value)
            queue.setRepeatMode(choice)
            if (choice === 0) {
                return interaction.reply(`Repeat mode set to: OFF`)
            }
            if (choice === 1) {
                return interaction.reply(`Repeat mode set to: SONG`)
            }
            return interaction.reply(`Repeat mode set to: QUEUE`)
        } catch (e) {
            return interaction.reply(`${e}`)
        }
    },
};