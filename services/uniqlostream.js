const { EmbedBuilder } = require('discord.js');
const config = require("../config.json");
const { error, log, fetchAllMessages, pricePrecision } = require('../utils/utils');

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;

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

/**
 * Watch a collection with automatic reconnect on stream errors/closes.
 * Unhandled ChangeStream 'error' events crash the Node process.
 */
function watchWithReconnect(collection, label, onChange) {
    let stream = null;
    let resumeToken = null;
    let reconnectTimer = null;
    let stopped = false;
    let attempt = 0;

    const clearReconnectTimer = () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    const closeStream = async () => {
        if (!stream) return;
        const current = stream;
        stream = null;
        current.removeAllListeners();
        try {
            await current.close();
        } catch (_) {
            // Stream may already be closed after an error
        }
    };

    const isNonResumableError = (err) => {
        const message = String(err?.message || err || '');
        const code = err?.code;
        // Resume token expired / not found in oplog — restart without resumeAfter
        return code === 286 || /resume|ChangeStreamHistoryLost|cannot resume/i.test(message);
    };

    const scheduleReconnect = (reason, err) => {
        if (stopped || reconnectTimer) return;

        if (err && isNonResumableError(err) && resumeToken) {
            error(`${label} change stream resume token is no longer valid; restarting without resume`);
            resumeToken = null;
        }

        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
        attempt += 1;
        error(`${label} change stream ${reason}; reconnecting in ${delay}ms (attempt ${attempt})`);

        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            await closeStream();
            start();
        }, delay);
    };

    const start = () => {
        if (stopped) return;

        try {
            const options = { fullDocument: 'updateLookup' };
            if (resumeToken) {
                options.resumeAfter = resumeToken;
            }

            stream = collection.watch([], options);

            stream.on('change', async (change) => {
                if (change?._id) {
                    resumeToken = change._id;
                }
                try {
                    await onChange(change);
                } catch (err) {
                    error(`Error in ${label} change stream:`, err);
                }
            });

            stream.on('error', (err) => {
                error(`${label} change stream error:`, err);
                scheduleReconnect('errored', err);
            });

            stream.on('close', () => {
                // 'close' often follows 'error'; only reconnect if we didn't already schedule
                if (!stopped && !reconnectTimer) {
                    scheduleReconnect('closed');
                }
            });

            if (attempt > 0) {
                log(`${label} change stream reconnected`);
            }
            attempt = 0;
        } catch (err) {
            error(`Failed to start ${label} change stream:`, err);
            scheduleReconnect('failed to start', err);
        }
    };

    start();

    return {
        stop: async () => {
            stopped = true;
            clearReconnectTimer();
            await closeStream();
        }
    };
}

function buildColorSizes(item) {
    if (!item.l2s || item.l2s.length === 0) {
        return null;
    }

    const colorSizes = item.l2s.reduce((acc, l2) => {
        // Handle both enhanced structure and fallback to display codes
        const colorName = l2.color.name || l2.color.displayCode || 'Unknown Color';
        const sizeName = l2.size.name || l2.size.displayCode || 'Unknown Size';
        const stockQuantity = l2.stock?.quantity || 0;
        const promoValue = l2.prices?.promo?.value || l2.prices?.base?.value || 0;

        // Skip items with 0 stock
        if (stockQuantity === 0) {
            return acc;
        }

        if (!acc[colorName]) {
            acc[colorName] = [];
        }
        acc[colorName].push(`${sizeName} (${stockQuantity}) (${pricePrecision(promoValue)})`);
        return acc;
    }, {});

    if (Object.keys(colorSizes).length === 0) {
        return null;
    }

    return colorSizes;
}

async function handleSaleChange(client, channelId, change, genderLabel, embedColor) {
    const channel = client.channels.cache.find(c => c.id === channelId);
    if (!channel) return;

    if (change.operationType === 'delete') {
        const itemId = change.documentKey._id;
        await cleanupOldMessages(channel, itemId);
        return;
    }

    if (change.operationType !== 'insert' && change.operationType !== 'update') {
        return;
    }

    const item = change.fullDocument;
    if (!item) return;

    await cleanupOldMessages(channel, item._id);

    const colorSizes = buildColorSizes(item);
    if (!colorSizes) {
        log(`Skipping ${genderLabel} item ${item.productId} - no in-stock l2s data available`);
        return;
    }

    const colorSizeLines = Object.entries(colorSizes)
        .map(([color, sizes]) => `**${color}**: ${sizes.join(', ')}`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setTitle(item.name)
        .setDescription(`**Base:** ${pricePrecision(item.prices.base.value)}\n**Promo:** ${pricePrecision(item.prices.promo?.value)}\n${colorSizeLines}`)
        .setColor(embedColor)
        .setURL(`https://www.uniqlo.com/au/en/products/${item.productId}`)
        .setTimestamp()
        .setFooter({ text: `Uniqlo ${genderLabel} Sale Updates | ID: ${item._id}` });

    if (item.images?.main) {
        const firstImage = Object.values(item.images.main)[0];
        if (firstImage?.image) {
            embed.setImage(firstImage.image);
        }
    }

    await channel.send({ embeds: [embed] });
}

async function uniqloStreamService(client) {
    try {
        // Get collections using the singleton pattern
        const maleCollection = client.mongodb.db.collection(config.mongodbDBUniqloMaleCurrent);
        const femaleCollection = client.mongodb.db.collection(config.mongodbDBUniqloFemaleCurrent);

        watchWithReconnect(maleCollection, 'Uniqlo male', (change) =>
            handleSaleChange(client, config.maleCurrentChannelId, change, "Men's", 0x0066cc)
        );

        watchWithReconnect(femaleCollection, 'Uniqlo female', (change) =>
            handleSaleChange(client, config.femaleCurrentChannelId, change, "Women's", 0xff69b4)
        );

        await cleanChannelOrphans(client, config.maleCurrentChannelId, maleCollection);
        await cleanChannelOrphans(client, config.femaleCurrentChannelId, femaleCollection);

        // await preloadChannelItems(client, config.maleCurrentChannelId, maleCollection);
        // await preloadChannelItems(client, config.femaleCurrentChannelId, femaleCollection);

        log('Uniqlo change streams initialized successfully');

    } catch (err) {
        error('Error initializing Uniqlo change streams:', err);
    }
}

async function cleanChannelOrphans(client, channelId, collection) {
    try {
        const channel = client.channels.cache.find(c => c.id === channelId);
        if (!channel) {
            error(`Channel ${channelId} not found`);
            return;
        }

        // Get all messages from the channel
        const messages = await fetchAllMessages(channel);
        
        // Get all item IDs from database for quick lookup
        const dbItems = await collection.find({}, { _id: 1 }).toArray();
        const dbIds = new Set(dbItems.map(item => item._id.toString())); // Convert ObjectIds to strings

        // Track message counts per ID
        const messageCountById = new Map();
        const messagesByItemId = new Map();

        // First pass - count messages per ID and track messages
        for (const msg of messages) {
            if (msg.embeds.length > 0) {
                const footer = msg.embeds[0].footer?.text;
                if (footer) {
                    const idMatch = footer.match(/ID: (.+)$/);
                    if (idMatch) {
                        const itemId = idMatch[1].toString();
                        messageCountById.set(itemId, (messageCountById.get(itemId) || 0) + 1);
                        
                        if (!messagesByItemId.has(itemId)) {
                            messagesByItemId.set(itemId, []);
                        }
                        messagesByItemId.get(itemId).push(msg);
                    }
                }
            }
        }

        // Second pass - handle duplicates and orphans
        for (const [itemId, count] of messageCountById) {
            const messages = messagesByItemId.get(itemId);
            
            if (!dbIds.has(itemId)) {
                // Delete all messages for orphaned IDs
                for (const msg of messages) {
                    await msg.delete().catch(e => error(`Failed to delete orphaned message: ${e}`));
                }
                log(`Deleted orphaned message(s) for item ${itemId}`);
            } else if (count > 1) {
                // Keep only the most recent message for items with duplicates
                const sortedMessages = messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                for (let i = 1; i < sortedMessages.length; i++) {
                    await sortedMessages[i].delete().catch(e => error(`Failed to delete duplicate message: ${e}`));
                }
                log(`Deleted ${count - 1} duplicate message(s) for item ${itemId}`);
            }
        }

        log(`Channel cleanup completed for ${channelId}`);
    } catch (err) {
        error('Error in cleanChannelOrphans:', err);
    }
}

async function preloadChannelItems(client, channelId, collection) {
    try {
        const channel = client.channels.cache.find(c => c.id === channelId);
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
                const colorSizes = buildColorSizes(item);
                if (!colorSizes) {
                    log(`Skipping preload item ${item.productId} - no in-stock l2s data available`);
                    continue;
                }
                
                const colorSizeLines = Object.entries(colorSizes).map(([color, sizes]) => `**${color}**: ${sizes.join(', ')}`).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(item.name)
                    .setDescription(`**Base:** ${pricePrecision(item.prices.base.value)}\n**Promo:** ${pricePrecision(item.prices.promo?.value)}\n${colorSizeLines}`)
                    .setColor(channelId === config.maleCurrentChannelId ? 0x0066cc : 0xff69b4)
                    .setURL(`https://www.uniqlo.com/au/en/products/${item.productId}`)
                    .setTimestamp()
                    .setFooter({ text: `Uniqlo ${channelId === config.maleCurrentChannelId ? "Men's" : "Women's"} Sale Updates | ID: ${itemId}` });
                if (item.images && item.images.main) {
                    const firstImage = Object.values(item.images.main)[0];

                    if (firstImage?.image) {
                        embed.setImage(firstImage.image);
                    }
                }
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
