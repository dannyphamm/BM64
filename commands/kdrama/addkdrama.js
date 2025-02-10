const { SlashCommandBuilder } = require('@discordjs/builders');
const config = require('../../config');
const cheerio = require('cheerio');
const axios = require('axios');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const {error, log} = require('../../utils/utils')
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
                .setName('search')
                .setDescription('Start tracking a kdrama')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the kdrama to start tracking')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Add a kdrama to the database')),
    async execute(interaction) {
        try {
            const client = interaction.client;
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString('name');
            const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);

            if (subcommand === 'stoptracking') {
                await kdramaCollection.findOneAndUpdate({ title: name }, // filter
                    { $set: { isCompleted: true } }, // update
                    { new: true, upsert: true } // options
                );
                return interaction.reply(`Stopped tracking ${name}`);
            } else if (subcommand === 'search') {
                try {
                    await interaction.deferReply();
                    const searchUrl = `https://kissasian.cam/?s=${encodeURIComponent(name).replace(/%20/g, '+')}`;
                    
                    const response = await axios.get(searchUrl);
                    const $ = cheerio.load(response.data);
                    
                    // Get the first article from search results
                    const firstArticle = $('.listupd article').first();
                    if (!firstArticle.length) {
                        return interaction.editReply(`No results found for "${name}"`);
                    }
            
                    const title = firstArticle.find('img').attr('title');
                    const banner = firstArticle.find('img').attr('src');
                    const link = firstArticle.find('a').attr('href');
                    
                    // Get details from the drama page
                    const dramaResponse = await axios.get(link);
                    const $drama = cheerio.load(dramaResponse.data);
                    
                    // Extract information
                    const description = $drama('.entry-content p').map((_, el) => $drama(el).text().trim()).get().join('\n\n');
                    const status = $drama('.spe span').first().text().replace('Status:', '').trim();
                    const rating = $drama('[itemprop="ratingValue"]').attr('content');
                    const duration = $drama('.spe span:contains("Duration:")')
                        .text()
                        .replace('Duration:', '')
                        .trim();
                    const genres = $drama('.genxed a')
                        .map((_, el) => $drama(el).text().trim())
                        .get()
                        .join(', ');
                    // Create embed
                    const attachment = new AttachmentBuilder(
                        await axios({ url: banner, responseType: 'arraybuffer' })
                            .then(response => Buffer.from(response.data)),
                        { name: 'drama.jpg' }
                    );
            
                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setImage('attachment://drama.jpg')
                        .setColor('#0099ff')
                        .setURL(link)
                        .setDescription(description);
            
                    // Add fields if information is available
                    if (rating) embed.addFields({ name: 'Rating', value: rating, inline: true });
                    if (duration) embed.addFields({ name: 'Duration', value: duration, inline: true });
                    if (status) embed.addFields({ name: 'Status', value: status, inline: true });
                    if (genres) embed.addFields({ name: 'Genres', value: genres });
            
                    // Create buttons
                    const trackButton = new ButtonBuilder()
                        .setCustomId(`starttracking_;_${title}`)
                        .setLabel('Start Tracking')
                        .setStyle(ButtonStyle.Primary);
            
                    const watchButton = new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('Watch Now')
                        .setURL(link);
            
                    const row = new ActionRowBuilder()
                        .addComponents(trackButton, watchButton);
            
                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment],
                        components: [row]
                    });
            
                } catch (e) {
                    error(e);
                    return interaction.editReply(`Error searching: ${e.message}`);
                }
            } else if (subcommand === 'test') {
                await kdramaTrackerService(client);
                return interaction.reply(`Tested`);
            }
        } catch (e) {
            return interaction.reply(`${e}`, { ephemeral: true });
        }

    },
};