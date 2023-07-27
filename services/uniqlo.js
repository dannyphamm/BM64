const { EmbedBuilder } = require('discord.js');
const { getUniqloItem, getLatestPrices, insertPrice } = require('../utils/uniqloApi');
const config = require('../config');
const axios = require('axios');
const {log, error} = require('../utils/utils')
async function trackUniqloItems(client) {
    const uniqloCollection = await client.mongodb.db.collection(config.mongodbDBUniqlo);
    const itemIds = await uniqloCollection.distinct('itemId');
    for (const itemId of itemIds) {
        const existingItem = await uniqloCollection.findOne({ itemId });
        if (!existingItem) {
            error(`Item ${itemId} not found in database.`);
            continue;
        }
        const latestPrice = existingItem.prices[existingItem.prices.length - 1];
        let { basePrice, promoPrice } = await getLatestPrices(itemId);

        if (basePrice !== latestPrice.basePrice || promoPrice !== latestPrice.promoPrice) {
            // Save the new price to MongoDB
            await insertPrice(client, itemId, basePrice, promoPrice, item.name);

            // Send an alert to a Discord channel
            const item = await getUniqloItem(itemId);
            const alertEmbed = new EmbedBuilder()
                .setTitle(`Price change for Uniqlo item ${itemId}`)
                .setURL(`https://www.uniqlo.com/au/en/products/${itemId}`)
                .setDescription(`The price of ${item.name} has changed.`)
                .addFields(
                    { name: 'Old Base Price', value: `$${parseInt(latestPrice.basePrice || 0).toFixed(2)}`, inline: true },
                    { name: 'New Base Price', value: `$${parseInt(basePrice).toFixed(2)}`, inline: true },
                )
                .setColor('#0099ff');
            if (promoPrice !== null) {
                alertEmbed.addFields(
                    { name: 'Old Promo Price', value: `$${parseInt(latestPrice.promoPrice || 0).toFixed(2)}`, inline: true },
                    { name: 'New Promo Price', value: `$${parseInt(promoPrice).toFixed(2)}`, inline: true },
                );
            }
            const channel = client.channels.cache.get(config.discordChannelId);
            channel.send({ embeds: [alertEmbed] });
        } else {
            log(`Item ${itemId} has not changed price.`);
        }
    }
}
async function fetchSaleItems(client, gender, discordId) {
    try {
        // Fetch the current state of the sale items API
        const response = await axios.get(`${config.uniqloApiUrl}/products?path=${gender}&flagCodes=discount%2Cdiscount&limit=1000&offset=0`);

        // If response is not 200 then return
        if (response.status !== 200) return (log("Error fetching sale items", response.status));

        // Retrieve the previous state of the sale items from your database
        const collection = await client.mongodb.db.collection(`sale-items-${gender}`);
        const previousState = await collection.find().toArray();
        if (previousState.length === 0) {
            log("Inserting data into database", response.data.result.items.length)
            for (const item of response.data.result.items) {
                await collection.updateOne({ id: item.productId }, { $set: item }, { upsert: true });
            }
            return;
        }
        // Compare the two states to find any differences
        const addedItems = response.data.result.items.filter(item => !previousState.find(i => i.productId === item.productId));
        const removedItems = previousState.filter(item => !response.data.result.items.find(i => i.productId === item.productId));
        const changedItems = response.data.result.items.reduce((acc, item) => {
            const previousItem = previousState.find(i => i.productId === item.productId);
            if (previousItem && (previousItem.prices.base.value !== item.prices.base.value || previousItem.prices.promo.value !== item.prices.promo.value)) {
                const priceDiff = {
                    base: previousItem.prices.base.value - item.prices.base.value,
                    promo: previousItem.prices.promo.value - item.prices.promo.value
                };
                acc.push([previousItem, item, priceDiff]);
            }
            return acc;
        }, []);
       log(addedItems.length, removedItems.length, changedItems.length)
        if (addedItems.length === 0 && removedItems.length === 0 && changedItems.length === 0) return;
        // Log any differences found
        const addedItemsEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Added items`)
            .setDescription(addedItems.map(item => `**[${item.name}](https://www.uniqlo.com/au/en/products/${item.productId})**\nBase: ${item.prices.base.value}\nPromo: ${item.prices.promo.value}`).join('\n\n') || 'None');

        const removedItemsEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Removed items`)
            .setDescription(removedItems.map(item => `**[${item.name}](https://www.uniqlo.com/au/en/products/${item.productId})**\nBase: ${item.prices.base.value}\nPromo: ${item.prices.promo.value}`).join('\n\n') || 'None');
        const changedItemsEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Changed items`)
            .setDescription(changedItems.map(item => `**[${item[0].name}](https://www.uniqlo.com/au/en/products/${item[0].productId})**\n
            **Base:** ${item[0].prices.base.value}\t\t**New Base:** ${item[1].prices.base.value} \t\t **Diff:** ${parseInt(item[1].prices.base.value) - parseInt(item[0].prices.base.value)}\n
            **Promo:** ${item[0].prices.promo.value}\t\t**New Promo:** ${item[1].prices.promo.value} **Diff:** ${parseInt(item[1].prices.promo.value) - parseInt(item[0].prices.promo.value)}`).join('\n\n') || 'None');
        // Update the database with the new state
        for (const item of addedItems) {

            await collection.updateOne({ id: item.productId }, { $set: item }, { upsert: true });
        }
        for (const item of removedItems) {

            await collection.deleteOne({ id: item.productId });
        }
        // Update the database for changeditems

        changedItems.map(async item => {

            log("Updating item", item[0].productId)
            await collection.updateOne({ id: item[0].productId }, { $set: item[1] }, { upsert: true });
        })

        if (addedItems.length > 0) {
            await client.channels.cache.get(discordId).send({ embeds: [addedItemsEmbed] });
        }

        if (removedItems.length > 0) {
            await client.channels.cache.get(discordId).send({ embeds: [removedItemsEmbed] });
        }

        if (changedItems.length > 0) {
            await client.channels.cache.get(discordId).send({ embeds: [changedItemsEmbed] });
        }
    } catch (e) {
        error(e);
    }
}

async function maleSaleItems(client) {
    await fetchSaleItems(client, '6991', config.maleSaleDiscordId);
}

async function femaleSaleItems(client) {
    await fetchSaleItems(client, '6990', config.femaleSaleDiscordId);
}

module.exports = { trackUniqloItems, maleSaleItems, femaleSaleItems };