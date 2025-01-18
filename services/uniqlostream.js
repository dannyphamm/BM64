const { WebhookClient, EmbedBuilder } = require('discord.js');
const config = require("../config.json");
const { error, log, fetchAllMessages, pricePrecision } = require('../utils/utils');


const cleanupOldMessages = async (channel, itemId) => {
    try {
        // Use the existing utility to fetch all messages
        const messages = await fetchAllMessages(channel);
        
        // Find and delete old messages about this item
        const oldMessages = messages.filter(msg => {
            if (msg.embeds.length === 0) return false;
            const embed = msg.embeds[0];
            return embed.footer?.text?.includes(`ID: ${itemId}`);
        });

        // Delete old messages
        for (const message of oldMessages.values()) {
            await message.delete().catch(e => error(`Failed to delete message: ${e}`));
        }
    } catch (err) {
        error('Error cleaning up old messages: ', err);
    }
};

async function uniqloStreamService(client) {
    try {
        // Get collections using the singleton pattern
        const maleCollection = await client.mongodb.db.collection(config.mongodbDBUniqloMaleCurrent);
        const femaleCollection = await client.mongodb.db.collection(config.mongodbDBUniqloFemaleCurrent);

        // Male items change stream
        const maleStream = maleCollection.watch([], { fullDocument: 'updateLookup' });
        maleStream.on('change', async (change) => {
            try {
                const channel = await client.channels.cache.find(c => c.id === config.maleCurrentChannelId);
                if (!channel) return;

                if (change.operationType === 'delete') {
                    // For deletions, we only have the _id in change.documentKey
                    const itemId = change.documentKey._id;
                    await cleanupOldMessages(channel, itemId);
                } else if (change.operationType === 'insert' || change.operationType === 'update') {
                    const item = change.fullDocument;
                    // Clean up old messages before sending new one
                    await cleanupOldMessages(channel, item.name);
                    
                    const colorSizes = item.l2s.reduce((acc, l2) => {
                        if (!acc[l2.color.name]) {
                            acc[l2.color.name] = [];
                        }
                        acc[l2.color.name].push(`${l2.size.name} (${l2.stock.quantity}) (${pricePrecision(l2.prices.promo.value)})`);
                        return acc;
                    }, {});
                    const colorSizeLines = Object.entries(colorSizes).map(([color, sizes]) => `${color}: ${sizes.join(', ')}`).join('\n');

                    const embed = new EmbedBuilder()
                        .setTitle(item.name)
                        .setDescription(`**Base:** ${pricePrecision(item.prices.base.value)}\n**Promo:** ${pricePrecision(item.prices.promo?.value)}\n${colorSizeLines}`)
                        .setColor(0x0066cc) // Uniqlo blue
                        .setURL(`https://www.uniqlo.com/au/en/products/${item.productId}`)
                        .setImage(item.images.main[0].url)
                        .setTimestamp()
                        .setFooter({ text: `Uniqlo Men's Sale Updates | ID: ${item._id}` });
                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                error('Error in male items change stream:', err);
            }
        });

        // Female items change stream
        const femaleStream = femaleCollection.watch([], { fullDocument: 'updateLookup' });
        femaleStream.on('change', async (change) => {
            try {
                const channel = await client.channels.cache.find(c => c.id === config.femaleCurrentChannelId);
                if (!channel) return;

                if (change.operationType === 'delete') {
                    // For deletions, we only have the _id in change.documentKey
                    const itemId = change.documentKey._id;
                    await cleanupOldMessages(channel, itemId);
                } else if (change.operationType === 'insert' || change.operationType === 'update') {
                    const item = change.fullDocument;
                    // Clean up old messages before sending new one
                    await cleanupOldMessages(channel, item.name);
                    
                    const colorSizes = item.l2s.reduce((acc, l2) => {
                        if (!acc[l2.color.name]) {
                            acc[l2.color.name] = [];
                        }
                        acc[l2.color.name].push(`${l2.size.name} (${l2.stock.quantity}) (${pricePrecision(l2.prices.promo.value)})`);
                        return acc;
                    }, {});
                    const colorSizeLines = Object.entries(colorSizes).map(([color, sizes]) => `${color}: ${sizes.join(', ')}`).join('\n');

                    const embed = new EmbedBuilder()
                        .setTitle(item.name)
                        .setDescription(`**Base:** ${pricePrecision(item.prices.base.value)}\n**Promo:** ${pricePrecision(item.prices.promo?.value)}\n${colorSizeLines}`)
                        .setColor(0xff69b4) // Pink
                        .setURL(`https://www.uniqlo.com/au/en/products/${item.productId}`)
                        .setImage(item.images.main[0].url)
                        .setTimestamp()
                        .setFooter({ text: `Uniqlo Women's Sale Updates | ID: ${item._id}` });
                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                error('Error in female items change stream:', err);
            }
        });

        log('Uniqlo change streams initialized successfully');

    } catch (err) {
        error('Error initializing Uniqlo change streams:', err);
    }
}

module.exports = {uniqloStreamService};

