const { SlashCommandBuilder } = require('@discordjs/builders');
const config = require('../../config');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('kdrama')
        .setDescription('Kdrama commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stoptracking')
                .setDescription('Stop tracking a kdrama')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the kdrama to stop tracking')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('starttracking')
                .setDescription('Start tracking a kdrama')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the kdrama to start tracking')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            const client = interaction.client;
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString('name');
            const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
            if (subcommand === 'stoptracking') {
                await kdramaCollection.findOneAndUpdate({ title: name }, // filter
                    { $set: { stoptracking: true } }, // update
                    { new: true, upsert: true } // options
                );
                return interaction.reply(`Stopped tracking ${name}`);
            } else if (subcommand === 'starttracking') {
                await kdramaCollection.findOneAndUpdate(
                    { title: name }, // filter
                    { $unset: { stoptracking: "" } }, // update
                    { new: true } // options
                )
                return interaction.reply(`Started tracking ${name}`);
            }
        } catch (e) {
            return interaction.reply(`${e}`, { ephemeral: true });
        }
    },
};