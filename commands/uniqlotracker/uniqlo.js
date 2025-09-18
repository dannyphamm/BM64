const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { insertPrice, getPriceHistory, getUniqloItem } = require('../../utils/uniqloApi');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../../services/uniqlo');
const config = require('../../config');
const Chart = require('chart.js/auto');
const { imageAttachment, fetchMessagesWithCriteria } = require('../../utils/utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uniqlo')
        .setDescription('Track a Uniqlo item by ID')
        .addSubcommand(subcommand =>
            subcommand
                .setName('track')
                .setDescription('Track a Uniqlo item by ID')
                .addStringOption(option =>
                    option.setName('itemid')
                        .setDescription('The ID of the Uniqlo item to track')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('untrack').setDescription('Untrack a Uniqlo item by ID')
                .addStringOption(option =>
                    option.setName('itemid')
                        .setDescription('The ID of the Uniqlo item to untrack')
                        .setRequired(true)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pricehistory')
                .setDescription('Get the price history of a Uniqlo item by ID')
                .addStringOption(option =>
                    option.setName('itemid')
                        .setDescription('The ID of the Uniqlo item to get the price history for')
                        .setRequired(true)
                )
        ).addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Force update all tracked Uniqlo items or a specific item by ID')
                .addStringOption(option =>
                    option.setName('itemid')
                        .setDescription('The ID of the Uniqlo item to update (optional)')
                )
                .addBooleanOption(option =>
                    option.setName('sale')
                        .setDescription('Only update items that are on sale')
                )
        ).addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all tracked Uniqlo items with their current price')
        ).addSubcommand(subcommand =>
            subcommand
                .setName('trackpricing')
                .setDescription('Track pricing for a Uniqlo item')
                .addStringOption(option =>
                    option.setName('itemid')
                        .setDescription('The ID of the Uniqlo item to track pricing for')
                        .setRequired(true)
                )
        ).addSubcommand(subcommand =>
            subcommand
                .setName('run')
                .setDescription('Manually run Uniqlo tracking functions')
                .addStringOption(option =>
                    option.setName('function')
                        .setDescription('Choose which function to run')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Track All Items', value: 'track_items' },
                            { name: 'Male Sale Items', value: 'male_sale' },
                            { name: 'Female Sale Items', value: 'female_sale' },
                            { name: 'All Sale Items', value: 'all_sale' }
                        )
                )
        ),

    async execute(interaction) {
        const { client } = interaction;
        const config = require('../../config');
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'track') {
            // Handle the track subcommand
            const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
            const itemId = interaction.options.getString('itemid');
            const existingItem = await uniqloCollection.findOne({ itemId })
            if (existingItem) {
                return interaction.reply('This item is already being tracked.')
            }

            const item = await getUniqloItem(itemId);
            const itemUrl = `https://www.uniqlo.com/au/en/products/${itemId}`;
            const basePrice = item.prices.base.value;
            const promoPrice = item.prices.promo ? item.prices.promo.value : null;

            // create a JSON object with the item ID, URL, and price(s)
            const embed = {
                title: `Tracking Uniqlo item ${itemId}`,
                url: itemUrl,
                description: `View the item at ${itemUrl}`,
                color: 0xff0000,
                fields: [
                    {
                        name: 'Base Price',
                        value: `$${parseInt(basePrice).toFixed(2)}`,
                        inline: true
                    }
                ]
            };

            // add promo price field if it exists
            if (promoPrice) {
                embed.fields.push({
                    name: 'Promo Price',
                    value: `$${parseInt(promoPrice).toFixed(2)}`,
                    inline: true
                });
            }

            const imageUrls = item.images.main.map(image => image.url);
            const image = await imageAttachment(imageUrls, 'combined-image.png');

            const confirmEmbed = new EmbedBuilder()
                .setTitle(`Track Uniqlo item ${item.name}?`)
                .setDescription(`View the item at ${itemUrl}?`)
                .addFields(
                    { name: 'Base Price', value: `$${parseInt(basePrice).toFixed(2)}`, inline: true },

                )
                .setColor('#0099ff');
            if (promoPrice) {
                confirmEmbed.addFields(
                    { name: 'Promo Price', value: `$${parseInt(promoPrice).toFixed(2)}`, inline: true },
                )
            }
            confirmEmbed.setImage(`attachment://combined-image.png`).addFields(
                { name: 'Confirm to add this item to tracking.', value: '\u200B' },
            );
            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm')
                .setLabel('Confirm')
                .setStyle('Primary');
            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Cancel')
                .setStyle('Danger');
            const confirmRow = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);
            const confirmMessage = await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], fetchReply: true, files: [image] });
            const filter = i => i.user.id === interaction.user.id && (i.customId === 'confirm' || i.customId === 'cancel');
            const collector = confirmMessage.createMessageComponentCollector({ filter, time: 15000 });
            collector.on('collect', async i => {
                if (i.customId === 'confirm') {
                    await insertPrice(client, item.productId, basePrice, promoPrice, item.name, item.images.main[0].url);

                    i.update({ content: `Uniqlo item ${itemId} has been added to tracking.`, components: [] });
                } else {
                    i.update({ content: 'Cancelled.', components: [] });
                }
            });
            collector.on('end', collected => {
                if (collected.size === 0) {
                    confirmMessage.edit({ content: 'Confirmation timed out.', components: [] });
                }
            });
        } else if (subcommand === 'untrack') {
            const itemId = interaction.options.getString('itemid');
            const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
            // check if itemId exists in the collection
            const existingItem = await uniqloCollection.findOne({ itemId });
            if (!existingItem) {
                return interaction.reply('This item is not being tracked.')
            }
            await uniqloCollection.updateOne({ itemId }, { $set: { tracking: false } });
            return interaction.reply(`Uniqlo item ${itemId} has been removed from tracking.`)
        } else if (subcommand === 'pricehistory') {
            // Handle the pricehistory subcommand
            const itemId = interaction.options.getString('itemid');
            const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
            const existingItem = await uniqloCollection.findOne({ itemId });
            if (!existingItem) {
                return interaction.reply(`Item ${itemId} not found in database.`);
            }
            const prices = existingItem.prices;
            //const item = await getUniqloItem(itemId);



            // Create a canvas for the graph
            const canvas = createCanvas(600, 400);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Plot the price data on the graph
            const basePrices = prices.map(price => price.basePrice);
            const promoPrices = prices.map(price => price.promoPrice);
            const maxPrice = Math.max(...basePrices.concat(promoPrices).filter(price => price !== null));
            const minPrice = Math.min(...basePrices.concat(promoPrices).filter(price => price !== null));
            const priceRange = maxPrice - minPrice;
            const plugin = {
                id: 'customCanvasBackgroundColor',
                beforeDraw: (chart, args, options) => {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = options.color || '#99ffff';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            };

            const chart = new Chart(ctx, {
                type: 'line',
                plugins: [plugin],

                data: {
                    labels: prices.map(price => {
                        const date = new Date(price.timestamp);
                        const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
                        const timeOptions = { hour: 'numeric', minute: 'numeric' };
                        const dateString = date.toLocaleDateString(undefined, dateOptions);
                        const timeString = date.toLocaleTimeString(undefined, timeOptions);
                        return [dateString, timeString];
                    }),
                    datasets: [
                        {
                            label: 'Base Price',
                            data: basePrices,
                            borderColor: '#ff0000',
                            fill: false,
                        },
                        {
                            label: 'Promo Price',
                            data: promoPrices,
                            borderColor: '#00ff00',
                            fill: false,
                        },
                    ],
                },
                options: {
                    plugins: {
                        customCanvasBackgroundColor: {
                            color: 'white',
                        },
                        title: {
                            display: true,
                            text: `Price history for ${existingItem.title}`,
                        },

                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date',
                            },
                        },
                        y: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Price',
                            },
                            suggestedMin: minPrice - priceRange * 0.1,
                            suggestedMax: maxPrice + priceRange * 0.1,
                        },
                    },

                },

            });
            chart.update()
            const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'pricehistory.png' });
            const attachment1 = await imageAttachment([existingItem.imageURL], 'image1')
            const historyEmbed = new EmbedBuilder()
                .setTitle(`Price history for Uniqlo item ${itemId}`)
                .setURL(`https://www.uniqlo.com/au/en/products/${itemId}`)
                .setDescription(`Price history for ${existingItem.title}.`)
                .setThumbnail('attachment://image1.png')
                .setImage('attachment://pricehistory.png')
                .setColor('#0099ff');
            for (const price of prices) {
                const date = new Date(price.timestamp).toLocaleString();
                historyEmbed.addFields(
                    { name: 'Date', value: date, inline: true },
                    { name: 'Base Price', value: `$${parseInt(price.basePrice).toFixed(2)}`, inline: true },
                );
                if (price.promoPrice !== null) {
                    historyEmbed.addFields(
                        { name: 'Promo Price', value: `$${parseInt(price.promoPrice).toFixed(2)}`, inline: true }
                    );
                } else {
                    historyEmbed.addFields(
                        { name: '\u200B', value: '\u200B', inline: true }
                    );
                }
            }
            return interaction.reply({ embeds: [historyEmbed], files: [attachment1, attachment] })
        } else if (subcommand === 'update') {
            // Handle the update subcommand
            const itemId = interaction.options.getString('itemid');
            const saleOnly = interaction.options.getBoolean('sale') || false;
            if (saleOnly) {
                await interaction.reply('Updating')
                await femaleSaleItems();
                await maleSaleItems();
                return interaction.followUp('Sale items updated.');
            }
            if (itemId) {

                const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
                const itemId = interaction.options.getString('itemid');
                const existingItem = await uniqloCollection.findOne({ itemId });
                if (!existingItem) {
                    return interaction.reply('This item is not being tracked.');
                }

                // Get the current price of the item
                const item = await getUniqloItem(itemId);
                if (item.length === 0) {
                    return interaction.reply('This item no longer exists.');
                }
                const basePrice = item.prices.base.value;
                const promoPrice = item.prices.promo ? item.prices.promo.value : null;
                console.log(existingItem.prices[existingItem.prices.length - 1].promoPrice, promoPrice)
                // Check if the price has changed
                if ((basePrice !== existingItem.prices[existingItem.prices.length - 1].basePrice)
                    || (promoPrice !== existingItem.prices[existingItem.prices.length - 1].promoPrice)) {

                    // Send an alert to a Discord channel
                    const alertEmbed = new EmbedBuilder()
                        .setTitle(`Price change for Uniqlo item ${itemId}`)
                        .setURL(`https://www.uniqlo.com/au/en/products/${itemId}`)
                        .setDescription(`The price of ${item.name} has changed.`)
                        .addFields(
                            { name: 'Old Base Price', value: `$${parseInt(existingItem.prices[existingItem.prices.length - 1].basePrice).toFixed(2)}`, inline: true },
                            { name: 'New Base Price', value: `$${parseInt(basePrice).toFixed(2)}`, inline: true },
                            { name: '\u200B', value: '\u200B' }
                        );
                    if (promoPrice !== existingItem.prices[existingItem.prices.length - 1].promoPrice) {
                        alertEmbed.addFields(

                            { name: 'Old Promo Price', value: `$${parseInt(existingItem.prices[existingItem.prices.length - 1].promoPrice).toFixed(2)}`, inline: true },
                            { name: 'New Promo Price', value: `$${parseInt(promoPrice).toFixed(2)}`, inline: true },
                            { name: '\u200B', value: '\u200B' }
                        );
                    }
                    const channel = client.channels.cache.get(config.discordChannelId);
                    await channel.send({ embeds: [alertEmbed] });

                    // Update the base price and promo price
                    existingItem.prices[existingItem.prices.length - 1].basePrice = basePrice;
                    existingItem.prices[existingItem.prices.length - 1].promoPrice = promoPrice;
                    // Save the new price to MongoDB
                    await insertPrice(client, itemId, basePrice, promoPrice, item.name, item.images.main[0].url);

                    return interaction.reply('The price has changed.');
                } else {
                    return interaction.reply('The price has not changed.');
                }
            } else {
                // Update all tracked items
                await trackUniqloItems(client);
                return interaction.reply('All tracked Uniqlo items have been updated.');
            }
        } else if (subcommand === 'list') {
            // Handle the list subcommand
            const uniqloCollection = client.mongodb.db.collection(config.mongodbDBUniqlo);
            const items = await uniqloCollection.find({ tracking: { $ne: false } }).toArray();
            const embed = new EmbedBuilder()
                .setTitle('Tracked Uniqlo Items')
                .setColor('#0099ff');
            for (const item of items) {
                console.log(item.itemId)
                const latestPrice = item.prices[item.prices.length - 1];
                embed.addFields(
                    { name: 'Item ID', value: item.itemId, inline: true },
                    { name: 'Item Name', value: `[${item.title}](https://www.uniqlo.com/au/en/products/${item.itemId})`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'Base Price', value: `$${parseInt(latestPrice.basePrice).toFixed(2)}`, inline: true },
                    { name: 'Promo Price', value: `$${parseInt(latestPrice.promoPrice || 0).toFixed(2)}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '\u200B', value: '\u200B' },
                );
            }
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'trackpricing') {
            const itemId = interaction.options.getString('itemid');
            if (!itemId) {
                return interaction.reply('Item ID is required.');
            }

            // Acknowledge the interaction immediately
            await interaction.deferReply();

            const priceData = await trackItemPricing(client, itemId);
            if (!priceData) {
                return interaction.editReply('No price data found for this item.');
            }

            const chart = await createPriceChart(priceData);
            const attachment = new AttachmentBuilder(chart.toBuffer('image/png'), { name: 'price_chart.png' });
            const embed = new EmbedBuilder()
                .setTitle(`Price Tracking for Uniqlo Item ${itemId}`)
                .setImage('attachment://price_chart.png');
            return interaction.editReply({ embeds: [embed], files: [attachment] });
        } else if (subcommand === 'run') {
            // Handle the run subcommand
            const functionToRun = interaction.options.getString('function');
            
            // Defer reply since these functions might take some time
            await interaction.deferReply();
            
            try {
                switch (functionToRun) {
                    case 'track_items':
                        await trackUniqloItems(client);
                        return interaction.editReply('✅ Successfully ran trackUniqloItems function. All tracked items have been updated.');
                        
                    case 'male_sale':
                        await maleSaleItems(client);
                        return interaction.editReply('✅ Successfully ran maleSaleItems function. Male sale items have been updated.');
                        
                    case 'female_sale':
                        await femaleSaleItems(client);
                        return interaction.editReply('✅ Successfully ran femaleSaleItems function. Female sale items have been updated.');
                        
                    case 'all_sale':
                        await maleSaleItems(client);
                        await femaleSaleItems(client);
                        return interaction.editReply('✅ Successfully ran both sale item functions. All sale items have been updated.');
                        
                    default:
                        return interaction.editReply('❌ Invalid function selected.');
                }
            } catch (error) {
                console.error('Error running manual function:', error);
                return interaction.editReply(`❌ Error running function: ${error.message}`);
            }
        }
    }
};
async function fetchAndLogAllEmbedsUsingRegex(client) {
    const channel = client.channels.cache.get('1133373625672679464');
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const message of messages.values()) {
        for (const embed of message.embeds) {
            if (embed.title && embed.title.startsWith('Added items')) {
                const description = embed.description;
                const regex = /\*\*\[(.*?)\]\((.*?)\)\*\*\s*Base:\s*\$(\d+\.\d+)\s*Promo:\s*\$(\d+\.\d+)/g;
                let match;
                while ((match = regex.exec(description)) !== null) {
                    console.log(`Item Name: ${match[1]}`);
                    console.log(`Item URL: ${match[2]}`);
                    console.log(`Base Price: ${match[3]}`);
                    console.log(`Promo Price: ${match[4]}`);
                }
            }
        }
    }
}
async function trackItemPricing(client, itemId) {
    const channel = client.channels.cache.get(config.maleSaleDiscordId);
    const messages = await fetchMessagesWithCriteria(channel, itemId);
    const priceData = [];

    for (const message of messages) {
        for (const embed of message.embeds) {
            if (embed.title && embed.title.startsWith('Added items')) {
                const description = embed.description;
                if (!description) continue; // Skip if description is undefined

                const regex = /\*\*\[(.*?)\]\((.*?)\)\*\*\s*Base:\s*\$(\d+\.\d+)\s*Promo:\s*\$(\d+\.\d+)/g;
                let match;
                while ((match = regex.exec(description)) !== null) {
                    if (match[2].includes(itemId)) {
                        console.log(`Matched Item ID: ${itemId}`);
                        console.log(`Matched Base Price: ${match[3]}`);
                        console.log(`Matched Promo Price: ${match[4]}`);
                        priceData.push({
                            date: message.createdAt,
                            basePrice: parseFloat(match[3]),
                            promoPrice: parseFloat(match[4])
                        });
                    }
                }
            }
        }
    }

    // Sort priceData by date in ascending order
    priceData.sort((a, b) => a.date - b.date);

    return priceData.length > 0 ? priceData : null;
}
async function createPriceChart(priceData) {
    const canvas = createCanvas(600, 400);
    const ctx = canvas.getContext('2d');

    // Set background color
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set chart title
    ctx.fillStyle = '#000000';
    ctx.font = '20px Arial';
    ctx.fillText('Price History', 200, 30);

    // Set axis labels
    ctx.font = '12px Arial';
    ctx.fillText('Date', 280, 380);
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Price', -200, 20);
    ctx.restore();

    // Calculate chart dimensions
    const chartWidth = 500;
    const chartHeight = 300;
    const chartX = 50;
    const chartY = 50;

    // Draw axes
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // Calculate data points
    const maxPrice = Math.max(...priceData.flatMap(data => [data.basePrice, data.promoPrice]));
    const minPrice = Math.min(...priceData.flatMap(data => [data.basePrice, data.promoPrice]));
    const priceRange = maxPrice - minPrice;
    const dateRange = priceData.length - 1;

    // Draw base price line
    ctx.strokeStyle = '#ff0000';
    ctx.beginPath();
    priceData.forEach((data, index) => {
        const x = chartX + (index / dateRange) * chartWidth;
        const y = chartY + chartHeight - ((data.basePrice - minPrice) / priceRange) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw promo price line
    ctx.strokeStyle = '#00ff00';
    ctx.beginPath();
    priceData.forEach((data, index) => {
        const x = chartX + (index / dateRange) * chartWidth;
        const y = chartY + chartHeight - ((data.promoPrice - minPrice) / priceRange) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw data points for base price
    ctx.fillStyle = '#ff0000';
    priceData.forEach((data, index) => {
        const x = chartX + (index / dateRange) * chartWidth;
        const y = chartY + chartHeight - ((data.basePrice - minPrice) / priceRange) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw data points for promo price
    ctx.fillStyle = '#00ff00';
    priceData.forEach((data, index) => {
        const x = chartX + (index / dateRange) * chartWidth;
        const y = chartY + chartHeight - ((data.promoPrice - minPrice) / priceRange) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw x-axis labels
    ctx.fillStyle = '#000000';
    ctx.font = '10px Arial';
    priceData.forEach((data, index) => {
        const x = chartX + (index / dateRange) * chartWidth;
        const date = data.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        ctx.fillText(date, x - 10, chartY + chartHeight + 15);
    });

    // Draw y-axis labels
    const yLabelCount = 5;
    for (let i = 0; i <= yLabelCount; i++) {
        const y = chartY + chartHeight - (i / yLabelCount) * chartHeight;
        const price = minPrice + (i / yLabelCount) * priceRange;
        ctx.fillText(price.toFixed(2), chartX - 40, y + 5);
    }

    return canvas;
}