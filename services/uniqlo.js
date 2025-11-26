const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getUniqloItem, getLatestPrices, insertPrice } = require('../utils/uniqloApi');
const config = require('../config');

const { log, error, imageAttachment, pricePrecision } = require('../utils/utils');

// Helper function to process items in batches with rate limiting
async function processItemsInBatches(items, batchSize, delayMs, processor) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
        
        const batchResults = await Promise.allSettled(
            batch.map(item => processor(item))
        );
        
        // Extract successful results and log failures
        batchResults.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                error(`Failed to process item ${batch[idx].productId}:`, result.reason);
                // Push a fallback result to maintain array structure
                results.push(null);
            }
        });
        
        // Rate limiting: delay between batches (except for the last batch)
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return results.filter(r => r !== null); // Filter out failed items
}

async function trackUniqloItems(client) {
    const uniqloCollection = await client.mongodb.db.collection(config.mongodbDBUniqlo);
    const itemIds = await uniqloCollection.distinct('itemId');
    for (const itemId of itemIds) {
        // If getUniqloItem returns an empty array, the item is no longer available on the website

        // If item in DB tracking is set to false already, skip


        const existingItem = await uniqloCollection.findOne({ itemId, tracking: true });
        if (!existingItem) {
            continue;
        }

        const latestPrice = existingItem.prices[existingItem.prices.length - 1];
        // Get the priceGroup from existing item or fetch it
        const priceGroup = existingItem.priceGroup || '01';
        let { basePrice, promoPrice } = await getLatestPrices(itemId, priceGroup);
        if (basePrice === null && promoPrice === null) {
            const channel = client.channels.cache.get(config.discordChannelId);
            channel.send(`Item ${itemId} is no longer available on the Uniqlo website.`);
            uniqloCollection.updateOne({ itemId }, { $set: { tracking: false } });
            return
        }
        if (basePrice !== latestPrice.basePrice || promoPrice !== latestPrice.promoPrice) {
            // Save the new price to MongoDB
            const item = await getUniqloItem(itemId, priceGroup);
            if (Array.isArray(item) && item.length === 0) {
                return error("FAIL: Item not found", itemId);
            }
            await insertPrice(client, itemId, basePrice, promoPrice, item.name, existingItem.imageURL, priceGroup);

            // Send an alert to a Discord channel

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
        // Fetch all sale items with pagination (max 100 items per request)
        let allItems = [];
        let offset = 0;
        const limit = 100;
        let hasMoreItems = true;

        while (hasMoreItems) {
            const url = await fetch(`${config.uniqloApiUrl}/products?path=${gender}&flagCodes=discount&limit=${limit}&offset=${offset}`, {
                headers: {
                    'x-fr-clientid': 'uq.au.web-spa'
                }
            });
            let response;
            try {
                response = await url.json();
            } catch (e) {
                const text = await url.text();
                error('Failed to parse JSON. Response:', text, 'Error:', e);
                throw new Error(`Invalid JSON response: ${e.message}`);
            }

            // If response is not ok, return error
            if (response.status !== "ok") {
                return error("Error fetching sale items", gender, `${config.uniqloApiUrl}/products?path=${gender}&flagCodes=discount&limit=${limit}&offset=${offset}`);
            }

            // Add items from this page to the total collection
            if (response.result.items && response.result.items.length > 0) {
                allItems = allItems.concat(response.result.items);

                // Check if we have more items to fetch
                const totalItems = response.result.pagination?.total || response.result.items.length;
                hasMoreItems = (offset + limit) < totalItems && response.result.items.length === limit;
                offset += limit;

                log(`Fetched ${response.result.items.length} items for ${gender}, total so far: ${allItems.length}`);
            } else {
                hasMoreItems = false;
            }
        }

        // If no items found, return
        if (allItems.length === 0) {
            return error("No sale items found", gender);
        }

        log(`Total items fetched for ${gender}: ${allItems.length}`);
        // Retrieve the previous state of the sale items from your database
        const collection = await client.mongodb.db.collection(`sale-items-${gender}`);
        const previousState = await collection.find().toArray();
        if (previousState.length === 0) {
            log("Inserting data into database", allItems.length)
            // Enhance all items with detailed product data before storing (in batches to avoid rate limiting)
            const enhancedItems = await processItemsInBatches(
                allItems,
                5, // Process 5 items at a time
                500, // 500ms delay between batches
                async (item) => {
                    const product = await getUniqloItem(item.productId, item.priceGroup)
                    let available;
                    if (Array.isArray(product) && product.length === 0) {
                        available = []
                    } else if (product && product.l2s && product.prices && product.stocks) {
                        // New API structure: include all l2s that have price data (regardless of promo/stock)
                        available = product.l2s.filter(l2 => {
                            const priceData = product.prices[l2.l2Id];
                            const stockData = product.stocks[l2.l2Id];
                            // Include if we have price data and stock data (even if quantity is 0)
                            return priceData && stockData;
                        }).map(l2 => {
                            // Attach the actual price and stock data for easier access
                            return {
                                ...l2,
                                prices: product.prices[l2.l2Id],
                                stock: product.stocks[l2.l2Id]
                            };
                        });
                    } else {
                        available = [];
                    }
                    // Merge sale item data with detailed product data
                    return {
                        ...item,
                        l2s: available,
                        images: product?.images || null,
                        name: product?.name || item.name,
                        // Keep the original sale item pricing for the main display
                        prices: item.prices
                    };
                }
            );

            for (const item of enhancedItems) {
                await collection.updateOne({ id: item.productId, priceGroup: item.priceGroup }, { $set: item }, { upsert: true });
            }
            return;
        }
        // Compare the two states to find any differences
        // Only compare items with the same productId AND priceGroup
        let addedItems = allItems.filter(item => !previousState.find(i => i.productId === item.productId && i.priceGroup === item.priceGroup))
        let removedItems = previousState.filter(item => !allItems.find(i => i.productId === item.productId && i.priceGroup === item.priceGroup));
        let changedItems = allItems.reduce((acc, item) => {
            // Find previous item with same productId AND priceGroup
            const previousItem = previousState.find(i => i.productId === item.productId && i.priceGroup === item.priceGroup);
            if (previousItem) {
                // Compare prices for items with same productId and priceGroup
                const oldBase = previousItem.prices.base?.value;
                const newBase = item.prices.base?.value;
                const oldPromo = previousItem.prices.promo?.value;
                const newPromo = item.prices.promo?.value;

                const baseChanged = oldBase !== newBase;
                const promoChanged = oldPromo !== newPromo;
                const promoToNull = (oldPromo !== null && newPromo === null);

                if (baseChanged || promoChanged || promoToNull) {
                    log(`Price change detected for ${item.productId} (priceGroup: ${item.priceGroup}):`,
                        `Base: ${oldBase} -> ${newBase} (${baseChanged})`,
                        `Promo: ${oldPromo} -> ${newPromo} (${promoChanged})`,
                        `PromoToNull: ${promoToNull}`);
                    acc.push([previousItem, item]);
                }
            }
            return acc;
        }, []);

        if (addedItems.length === 0 && removedItems.length === 0 && changedItems.length === 0) return;

        addedItems = await processItemsInBatches(
            addedItems,
            5, // Process 5 items at a time
            500, // 500ms delay between batches
            async (item) => {
            const product = await getUniqloItem(item.productId, item.priceGroup)
            if (Array.isArray(product) && product.length === 0) {
                available = []
            } else if (product && product.l2s && product.prices && product.stocks) {
                // New API structure: include all l2s that have price data (regardless of promo/stock)
                available = product.l2s.filter(l2 => {
                    const priceData = product.prices[l2.l2Id];
                    const stockData = product.stocks[l2.l2Id];
                    // Include if we have price data and stock data (even if quantity is 0)
                    return priceData && stockData;
                }).map(l2 => {
                    // Attach the actual price and stock data for easier access
                    return {
                        ...l2,
                        prices: product.prices[l2.l2Id],
                        stock: product.stocks[l2.l2Id]
                    };
                });
            } else {
                available = [];
            }
            // Merge sale item data with detailed product data
            const result = {
                ...item,
                l2s: available,
                images: product?.images || null,
                name: product?.name || item.name,
                // Keep the original sale item pricing for the main display
                prices: item.prices
            };
            return result;
            }
        );
        removedItems = await processItemsInBatches(
            removedItems,
            5, // Process 5 items at a time
            500, // 500ms delay between batches
            async (item) => {
            const product = await getUniqloItem(item.productId, item.priceGroup)
            if (Array.isArray(product) && product.length === 0) {
                available = []
            } else if (product.l2s && product.prices && product.stocks) {
                // New API structure: include all l2s that have price data (regardless of promo/stock)
                available = product.l2s.filter(l2 => {
                    const priceData = product.prices[l2.l2Id];
                    const stockData = product.stocks[l2.l2Id];
                    // Include if we have price data and stock data (even if quantity is 0)
                    return priceData && stockData;
                }).map(l2 => {
                    // Attach the actual price and stock data for easier access
                    return {
                        ...l2,
                        prices: product.prices[l2.l2Id],
                        stock: product.stocks[l2.l2Id]
                    };
                });
            } else {
                available = [];
            }
            // Merge sale item data with detailed product data
            return {
                ...item,
                l2s: available,
                images: product.images,
                name: product.name || item.name,
                // Keep the original sale item pricing for the main display
                prices: item.prices
            };
            }
        );
        changedItems = await processItemsInBatches(
            changedItems,
            5, // Process 5 items at a time
            500, // 500ms delay between batches
            async (item) => {
            const product = await getUniqloItem(item[1].productId, item[1].priceGroup)
            let available;
            if (Array.isArray(product) && product.length === 0) {
                available = []
            } else if (product.l2s && product.prices && product.stocks) {
                // New API structure: include all l2s that have price data (regardless of promo/stock)
                available = product.l2s.filter(l2 => {
                    const priceData = product.prices[l2.l2Id];
                    const stockData = product.stocks[l2.l2Id];
                    // Include if we have price data and stock data (even if quantity is 0)
                    return priceData && stockData;
                }).map(l2 => {
                    // Attach the actual price and stock data for easier access
                    return {
                        ...l2,
                        prices: product.prices[l2.l2Id],
                        stock: product.stocks[l2.l2Id]
                    };
                });
            } else {
                available = [];
            }

            // For changed items, keep the old item as-is and enhance the new item
            const enhancedItem0 = item[0]; // Keep old item unchanged
            const enhancedItem1 = {
                ...item[1],
                l2s: available,
                images: product?.images || null,
                name: product?.name || item[1].name,
                // Keep the original sale item pricing for the main display
                prices: item[1].prices
            };

            return [enhancedItem0, enhancedItem1];
            }
        );

        const addedItemsEmbeds = [];
        const removedItemsEmbeds = [];
        const changedItemsEmbeds = [];
        const batchSize = 4;
        for (let i = 0; i < addedItems.length; i += batchSize) {
            const batch = addedItems.slice(i, i + batchSize);
            const addedItemsImageUrls = batch.map(item => {
                if (item.images && item.images.main) {
                    // Handle new API structure where main is an object with color codes as keys
                    const firstImage = Object.values(item.images.main)[0];
                    return firstImage ? firstImage.image : null;
                }
                return null;
            });
            const addedItemsImage = await imageAttachment(addedItemsImageUrls, "added-items");
            const addedItemsEmbed = {
                color: 0x0099ff,
                title: `Added items (${i + 1}-${i + batch.length})`,
                description: batch.map(item => {
                    log("Added ITEM", item.name)
                    const colorSizes = item.l2s.reduce((acc, l2) => {
                        // Skip items with 0 stock
                        if (l2.stock.quantity === 0) {
                            return acc;
                        }

                        // Use actual color name from details API
                        const colorKey = l2.color.name || l2.color.displayCode;
                        if (!acc[colorKey]) {
                            acc[colorKey] = [];
                        }
                        const sizeName = l2.size.name || l2.size.displayCode;
                        const promoValue = l2.prices.promo ? l2.prices.promo.value : l2.prices.base.value;
                        acc[colorKey].push(`${sizeName} (${l2.stock.quantity}) (${pricePrecision(promoValue)})`);
                        return acc;
                    }, {});
                    const colorSizeLines = Object.entries(colorSizes).map(([color, sizes]) => `**${color}**: ${sizes.join(', ')}`).join('\n');
                    return `**[${item.name}](https://www.uniqlo.com/au/en/products/${item.productId})**\nBase: ${pricePrecision(item.prices.base.value)}\nPromo: ${pricePrecision(item.prices.promo?.value)}\n${colorSizeLines}`;
                }).join('\n\n') || 'None',
                image: { url: `attachment://added-items.png` }
            }
            addedItemsEmbeds.push({ addedItemsEmbed, addedItemsImage });
        }
        for (let i = 0; i < removedItems.length; i += batchSize) {
            const batch = removedItems.slice(i, i + batchSize);
            const removedItemsImageUrls = batch.map(item => {
                if (item.images && item.images.main) {
                    // Handle new API structure where main is an object with color codes as keys
                    const firstImage = Object.values(item.images.main)[0];
                    return firstImage ? firstImage.image : null;
                }
                return null;
            });
            const removedItemsImage = await imageAttachment(removedItemsImageUrls, "removed-items");
            const removedItemsEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Removed items (${i + 1}-${i + batch.length})`)
                .setDescription(batch.map(item => {
                    log("Removed ITEM", item.name, item.productId)
                    return `**[${item.name}](https://www.uniqlo.com/au/en/products/${item.productId})**\nBase: ${pricePrecision(item.prices.base.value)}\nPromo: ${pricePrecision(item.prices.promo?.value)}`
                }).join('\n\n') || 'None')
                .setImage(`attachment://removed-items.png`)

            removedItemsEmbeds.push({ removedItemsEmbed, removedItemsImage });
        }
        for (let i = 0; i < changedItems.length; i += batchSize) {
            const batch = changedItems.slice(i, i + batchSize);
            const changedItemsImageUrls = batch.map(item => {
                if (item[1].images && item[1].images.main) {
                    // Handle new API structure where main is an object with color codes as keys
                    const firstImage = Object.values(item[1].images.main)[0];
                    return firstImage ? firstImage.image : null;
                }
                return null;
            });
            const changedItemsImage = await imageAttachment(changedItemsImageUrls, "changed-items");
            const changedItemsEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Changed items (${i + 1}-${i + batch.length})`)
                .setDescription(batch.map(item => {
                    log("Changed ITEM", item[1].name)
                    const colorSizes = item[1].l2s.reduce((acc, l2) => {
                        // Use actual color name from details API
                        const colorKey = l2.color.name || l2.color.displayCode;
                        if (!acc[colorKey]) {
                            acc[colorKey] = [];
                        }
                        const sizeName = l2.size.name || l2.size.displayCode;
                        const promoValue = l2.prices.promo ? l2.prices.promo.value : l2.prices.base.value;
                        acc[colorKey].push(`${sizeName} (${l2.stock.quantity}) (${pricePrecision(promoValue)})`);
                        return acc;
                    }, {});
                    const colorSizeLines = Object.entries(colorSizes).map(([color, sizes]) => `**${color}**: ${sizes.join(', ')}`).join('\n');
                    return `**[${item[0].name}](https://www.uniqlo.com/au/en/products/${item[0].productId})**\n
                  **Base:** ${pricePrecision(item[0].prices.base?.value)}\t\t**New Base:** ${pricePrecision(item[1].prices.base?.value)} \t\t **Diff:** ${pricePrecision(parseInt(item[1].prices.base?.value) - parseInt(item[0].prices.base?.value))}\n
                  **Promo:** ${pricePrecision(item[0].prices.promo?.value)}\t\t**New Promo:** ${pricePrecision(item[1].prices.promo?.value)} **Diff:** ${pricePrecision(parseInt(item[1].prices.promo?.value) - parseInt(item[0].prices.promo?.value))}\n
                  ${colorSizeLines}`;
                }).join('\n\n') || 'None')
                .setImage(`attachment://changed-items.png`)
            changedItemsEmbeds.push({ changedItemsEmbed, changedItemsImage });
        }
        // not dev move
        if (config.mode !== 'DEV') {
            for (const data of addedItemsEmbeds) {
                await client.channels.cache.get(discordId).send({ embeds: [data.addedItemsEmbed], files: [data.addedItemsImage] });
            }
            for (const data of removedItemsEmbeds) {
                await client.channels.cache.get(discordId).send({ embeds: [data.removedItemsEmbed], files: [data.removedItemsImage] });
            }
            for (const data of changedItemsEmbeds) {
                await client.channels.cache.get(discordId).send({ embeds: [data.changedItemsEmbed], files: [data.changedItemsImage] });
            }

            //Update the database with the new state (enhanced items with detailed l2s data)
            for (const item of addedItems) {
                await collection.updateOne({ id: item.productId, priceGroup: item.priceGroup }, { $set: item }, { upsert: true });
            }
            for (const item of removedItems) {
                await collection.deleteOne({ id: item.productId, priceGroup: item.priceGroup });
            }
            changedItems.map(async item => {
                // Store the enhanced version (item[1]) which has the detailed l2s data
                await collection.updateOne({ id: item[1].productId, priceGroup: item[1].priceGroup }, { $set: item[1] }, { upsert: true });
            })
        }
    } catch (e) {
        error(e, "FETCH SALE ITEMS", gender);
    }
}

async function maleSaleItems(client) {
    await fetchSaleItems(client, '6991', config.maleSaleDiscordId);
}

async function femaleSaleItems(client) {
    await fetchSaleItems(client, '6990', config.femaleSaleDiscordId);
}

module.exports = { trackUniqloItems, maleSaleItems, femaleSaleItems };