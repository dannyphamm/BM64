const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { insertPrice, getPriceHistory, getUniqloItem } = require('../../utils/uniqloApi');
const config = require('../../config');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { trackUniqloItems } = require('../../services/uniqlo');

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
        ).addSubcommand(subcommand =>
            subcommand
              .setName('list')
              .setDescription('List all tracked Uniqlo items with their current price')
          ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'track') {
            // Handle the track subcommand
            const uniqloCollection = interaction.client.mongodb.db.collection(config.mongodbDBUniqlo);
            const itemId = interaction.options.getString('itemid');
            const existingItem = await uniqloCollection.findOne({ itemId })
            if (existingItem) {
                return interaction.reply('This item is already being tracked.')
            }

            const item = await getUniqloItem(itemId);
            const itemUrl = `https://www.uniqlo.com/au/en/product/${itemId}.html`;
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
            console.log(imageUrls)
            const gridSize = Math.ceil(Math.sqrt(imageUrls.length));
            const gridWidth = gridSize * 200;
            const gridHeight = gridSize * 200;

            const imageBuffers = await Promise.all(imageUrls.map(async (imageUrl) => {
                const response = await fetch(imageUrl);
                const buffer = await response.arrayBuffer();
                return buffer;
            }));

            const canvas = createCanvas(gridWidth, gridHeight);
            const ctx = canvas.getContext('2d');

            for (let i = 0; i < imageBuffers.length; i++) {
                const img = await loadImage(Buffer.from(imageBuffers[i]));
                const x = (i % gridSize) * 200;
                const y = Math.floor(i / gridSize) * 200;
                ctx.drawImage(img, x, y, 200, 200);
            }

            const attachment = await new AttachmentBuilder(canvas.toBuffer('image/png'), {name: 'combined-image.png'});


            // reply with embed
            //await interaction.reply({ files: [attachment] });
            //await interaction.followUp({ embeds: [embed] });


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
                { name: 'Confirm to add this item to tracking.', value: '\u200B'},
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
            const confirmMessage = await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], fetchReply: true, files: [attachment] });
            const filter = i => i.user.id === interaction.user.id && (i.customId === 'confirm' || i.customId === 'cancel');
            const collector = confirmMessage.createMessageComponentCollector({ filter, time: 15000 });
            collector.on('collect', async i => {
                if (i.customId === 'confirm') {
                    await insertPrice(interaction.client, item.productId, basePrice, promoPrice, item.name);
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

        } else if (subcommand === 'pricehistory') {
            // Handle the pricehistory subcommand
            const itemId = interaction.options.getString('id');
            const uniqloCollection = interaction.client.mongodb.db.collection(config.mongodbDBUniqlo);
            const existingItem = await uniqloCollection.findOne({ itemId });
            if (!existingItem) {
                return interaction.reply(`Item ${itemId} not found in database.`);
            }
            const prices = existingItem.prices;
            const item = await getUniqloItem(itemId);
            const historyEmbed = new EmbedBuilder()
                .setTitle(`Price history for Uniqlo item ${itemId}`)
                .setURL(`https://www.uniqlo.com/au/en/product/${itemId}.html`)
                .setDescription(`Price history for ${item.name}.`)
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
            await interaction.reply({ embeds: [historyEmbed] });
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
                            text: `Price history for ${item.name}`,
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


            await interaction.followUp({ files: [attachment] })
        } else if (subcommand === 'update') {
            // Handle the update subcommand
            const itemId = interaction.options.getString('id');
            if (itemId) {

                const uniqloCollection = interaction.client.mongodb.db.collection(config.mongodbDBUniqlo);
                const itemId = interaction.options.getString('itemid');
                const existingItem = await uniqloCollection.findOne({ itemId });
                if (!existingItem) {
                    return interaction.reply('This item is not being tracked.');
                }

                // Get the current price of the item
                const item = await getUniqloItem(itemId);
                const basePrice = (parseInt(item.prices.base.value) + 5).toString();
                const promoPrice = item.prices.promoPrice ? item.prices.promo.value : null;

                // Check if the price has changed
                if (basePrice !== existingItem.prices[existingItem.prices.length - 1].basePrice
                    || promoPrice !== existingItem.prices[existingItem.prices.length - 1].promoPrice) {

                    // Send an alert to a Discord channel
                    const alertEmbed = new EmbedBuilder()
                        .setTitle(`Price change for Uniqlo item ${itemId}`)
                        .setURL(`https://www.uniqlo.com/au/en/product/${itemId}.html`)
                        .setDescription(`The price of ${item.name} has changed.`)
                        .addFields(
                            { name: 'Old Base Price', value: `$${parseInt(existingItem.prices[existingItem.prices.length - 1].basePrice).toFixed(2)}`, inline: true },
                            { name: 'New Base Price', value: `$${parseInt(basePrice).toFixed(2)}`, inline: true },

                        );
                    if (promoPrice && existingItem.prices[existingItem.prices.length - 1].promoPrice) {
                        alertEmbed.addFields(
                            { name: 'Old Promo Price', value: `$${parseInt(existingItem.prices[existingItem.prices.length - 1].promoPrice).toFixed(2)}`, inline: true },
                            { name: 'New Promo Price', value: `$${parseInt(promoPrice).toFixed(2)}`, inline: true },
                        );
                    }
                    const channel = interaction.client.channels.cache.get(config.discordChannelId);
                    await channel.send({ embeds: [alertEmbed] });

                    // Update the base price and promo price
                    existingItem.prices[existingItem.prices.length - 1].basePrice = basePrice;
                    existingItem.prices[existingItem.prices.length - 1].promoPrice = promoPrice;
                    // Save the new price to MongoDB
                    await insertPrice(interaction.client, itemId, basePrice, promoPrice, item.name);

                    return interaction.reply('The price has changed. The new price has been saved to the database and an alert has been sent to the Discord channel.');
                } else {
                    return interaction.reply('The price has not changed.');
                }
            } else {
                // Update all tracked items
                await trackUniqloItems(interaction.client);
                interaction.reply('All tracked Uniqlo items have been updated.');
            }
        } else if (subcommand === 'list') {
            // Handle the list subcommand
            const uniqloCollection = interaction.client.mongodb.db.collection(config.mongodbDBUniqlo);
            const items = await uniqloCollection.find().toArray();
            const embed = new EmbedBuilder()
              .setTitle('Tracked Uniqlo Items')
              .setColor('#0099ff');
            for (const item of items) {
              const latestPrice = item.prices[item.prices.length - 1];
              embed.addFields(
                { name: 'Item ID', value: item.itemId, inline: true },
                { name: 'Item Name', value: `[${item.title}](https://www.uniqlo.com/au/en/product/${item.itemId}.html)`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true},
                { name: 'Base Price', value: `$${parseInt(latestPrice.basePrice).toFixed(2)}`, inline: true },
                { name: 'Promo Price', value: `$${parseInt(latestPrice.promoPrice || 0).toFixed(2)}`, inline: true},
                { name: '\u200B', value: '\u200B', inline: true},
                { name: '\u200B', value: '\u200B'},
                );
            }
            interaction.reply({ embeds: [embed] });
          }
    }
};