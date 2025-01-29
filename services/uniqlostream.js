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
                        .setImage(item.images?.main?.[0]?.url || '')
                        .setTimestamp()
                        .setFooter({ text: `Uniqlo Women's Sale Updates | ID: ${item._id}` });
                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                error('Error in female items change stream:', err);
            }
        });

        // await cleanChannelOrphans(client, config.maleCurrentChannelId, maleCollection);
        // await cleanChannelOrphans(client, config.femaleCurrentChannelId, femaleCollection);

        await preloadChannelItems(client, config.maleCurrentChannelId, maleCollection);
        await preloadChannelItems(client, config.femaleCurrentChannelId, femaleCollection);

        log('Uniqlo change streams initialized successfully');

    } catch (err) {
        error('Error initializing Uniqlo change streams:', err);
    }
}

async function cleanChannelOrphans(client, channelId, collection) {
    try {
        const channel = await client.channels.cache.find(c => c.id === channelId);
        if (!channel) {
            error(`Channel ${channelId} not found`);
            return;
        }

        // Get all messages from the channel
        const messages = await fetchAllMessages(channel);
        
        // Get all item IDs from database for quick lookup
        const dbItems = await collection.find({}, { _id: 1 }).toArray();
        const dbIds = new Set(dbItems.map(item => item._id));

        // Check each message
        for (const msg of messages) {
            if (msg.embeds.length > 0) {
                const footer = msg.embeds[0].footer?.text;
                if (footer) {
                    const idMatch = footer.match(/ID: (.+)$/);
                    if (idMatch && !dbIds.has(idMatch[1])) {
                        await msg.delete().catch(e => error(`Failed to delete message: ${e}`));
                        log(`Deleted orphaned message for item ${idMatch[1]}`);
                    }
                }
            }
        }

        log(`Channel cleanup completed for ${channelId}`);
    } catch (err) {
        error('Error in cleanChannelOrphans:', err);
    }
}

async function preloadChannelItems(client, channelId, collection) {
    try {
        const channel = await client.channels.cache.find(c => c.id === channelId);
        if (!channel) {
            error(`Channel ${channelId} not found`);
            return;
        }

        // Get existing message IDs
        const messages = await fetchAllMessages(channel);
        const existingIds = new Set();
        messages.forEach(msg => {
            if (msg.embeds.length > 0) {
                const footer = msg.embeds[0].footer?.text;
                if (footer) {
                    const idMatch = footer.match(/ID: (.+)$/);
                    if (idMatch) {
                        log(`Existing ID: ${idMatch[1]}`);
                        existingIds.add(idMatch[1].toString());
                    }
                }
            }
        });

        // Get all items from database that aren't already posted
        const dbItems = await collection.find({}).toArray();
        let loadCount = 0;
        log(`Existing IDs: ${Array.from(existingIds).join(', ')}`);
        
        for (const item of dbItems) {
            const itemId = item._id.toString();
            log(`Checking DB item: ${itemId}, Exists: ${existingIds.has(itemId)}`);
            if (!existingIds.has(itemId)) {
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
                    .setColor(channelId === config.maleCurrentChannelId ? 0x0066cc : 0xff69b4)
                    .setURL(`https://www.uniqlo.com/au/en/products/${item.productId}`)
                    .setImage(item.images?.main?.[0]?.url || '')
                    .setTimestamp()
                    .setFooter({ text: `Uniqlo ${channelId === config.maleCurrentChannelId ? "Men's" : "Women's"} Sale Updates | ID: ${itemId}` });
                
                await channel.send({ embeds: [embed] }).catch(e => error(`Failed to create message: ${e}`));
                loadCount++;
            }
        }

        log(`Preload completed for channel ${channelId}. Added ${loadCount} new items.`);
        log(`Total existing IDs: ${existingIds.size}, Total DB items: ${dbItems.length}`);
    } catch (err) {
        error('Error in preloadChannelItems:', err);
    }
}

module.exports = {
    uniqloStreamService,
    cleanChannelOrphans,
    preloadChannelItems
};

