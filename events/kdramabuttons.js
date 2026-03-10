const { InteractionType } = require("discord-api-types/v10");
const { log, error } = require('../utils/utils.js');
const config = require('../config.json');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        const { client } = interaction;
        if (interaction.type == InteractionType.MessageComponent) {
            if (!interaction.isButton()) return
            log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);

            // Handle start tracking button
            if (interaction.customId.includes('starttracking_')) {
                await interaction.reply({content:'Adding to tracking list...'});
                const kdramaName = interaction.customId.split('_;_')[1];
                
                const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
                kdramaCollection.insertOne({ 
                    title: kdramaName, 
                    isCompleted: false 
                }, (err, result) => {
                    if (err) {
                        error(err, "Failed to add kdrama to database");
                    } else {
                        log(`Added ${kdramaName} to kdrama tracking.`);
                    }
                });
                await interaction.editReply({content: `Started Tracking: ${kdramaName}`})
            }

            // Handle mark complete button
            if (interaction.customId.startsWith('markComplete_')) {
                const kdramaName = interaction.customId.replace('markComplete_', '').replace(/_/g, ' ');
                const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);

                try {
                    await interaction.deferUpdate();
                    
                    // Update database
                    await kdramaCollection.updateOne(
                        { title: kdramaName },
                        { $set: { isCompleted: true } }
                    );

                    // Get webhook
                    const channel = interaction.channel;
                    const webhooks = await channel.fetchWebhooks();
                    const webhook = webhooks.find(wh => wh.token);

                    if (webhook) {
                        // Get the original message components
                        const message = interaction.message;
                        const components = message.components;
                        
                        // Create new action row with updated buttons
                        const newComponents = components.map(row => {
                            const newRow = new ActionRowBuilder();
                            
                            const buttons = row.components.map(button => {
                                if (button.customId === interaction.customId) {
                                    return ButtonBuilder.from(button)
                                        .setDisabled(true)
                                        .setStyle(ButtonStyle.Danger)
                                        .setLabel('Completed');
                                } else {
                                    return ButtonBuilder.from(button);
                                }
                            });
                            
                            return newRow.addComponents(buttons);
                        });

                        // Update the message using webhook
                        await webhook.editMessage(message.id, {
                            components: newComponents
                        });
                        
                        log(`Marked ${kdramaName} as completed`);
                    } else {
                        throw new Error('No webhook found');
                    }
                } catch (err) {
                    error(err, "Failed to mark kdrama as complete");
                }
            }
        }
    },
};