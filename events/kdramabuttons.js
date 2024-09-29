const { InteractionType } = require("discord-api-types/v10");
const { log, error } = require('../utils/utils.js');
const { socketIO } = require("../utils/socket.js");
const { spotify } = require("../utils/spotify.js");
const config = require('../config.json');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const { client } = interaction;
        // v14 interaction.type == InteractionType.ApplicationCommandAutocomplete
        if (interaction.type == InteractionType.MessageComponent) {
            if (!interaction.isButton()) return
            log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
            if (interaction.customId.includes('starttracking_')) {
                await interaction.reply({content:'Adding to tracking list...'});
                const kdramaName = interaction.customId.split('_;_')[1];
                
                const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
                kdramaCollection.insertOne({ title: kdramaName, isTracking: true, isCompleted: false }, (err, result) => {
                    if (err) {
                        error(err, "Failed to add kdrama to database");
                    } else {
                        log(`Added ${kdramaName} to kdrama tracking.`);
                    }
                });
                await interaction.editReply({content: `Started Tracking: ${kdramaName}`})
            }
        }

    },
};