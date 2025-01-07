const { SlashCommandBuilder } = require('@discordjs/builders');
const config = require('../../config');
const cheerio = require('cheerio');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const {error} = require('../../utils/utils')
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
                .setName('starttracking')
                .setDescription('Start tracking a kdrama')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the kdrama to start tracking')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            const client = interaction.client;
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString('name');
            const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
            if (subcommand === 'stoptracking') {
                await kdramaCollection.findOneAndUpdate({ title: name }, // filter
                    { $set: { isTracking: false } }, // update
                    { new: true, upsert: true } // options
                );
                return interaction.reply(`Stopped tracking ${name}`);
            } else if (subcommand === 'starttracking') {
                const axios = require('axios'); // Import axios
                const searchUrl = `https://watchasia.is/search?type=movies&keyword=${encodeURIComponent(name)}`; // Construct search URL

                try {
                    const response = await axios.get(searchUrl); // Make the GET request
                    const $ = cheerio.load(response.data);
                    const results = $('.switch-block.list-episode-item img').map((i, elem) => ({
                        title: $(elem).attr('alt'),
                        banner: $(elem).attr('data-original')
                    })).toArray();
                   
                    const attachment = await Promise.all(results.map(async (result, index) => {
                    
                        const buffer = await axios(result.banner, {
                            responseType: 'arraybuffer'
                        }).then(response => { return response.data })
                        const imageBuffer = Buffer.from(buffer)
                        const attachment = new AttachmentBuilder(imageBuffer, {name: `${index}.jpg`})
                        return attachment
                    }))
                    const embeds = results.map((result, index) => {
                        const embed = new EmbedBuilder()
                            .setTitle(result.title) // Set the title of the embed
                            .setImage(`attachment://${index}.jpg`) // Set the image of the embed
                            .setColor('#0099ff'); // Set embed color
                        return embed;
                    });
                    // const thumbnailNames = embeds.map(embed => embed.thumbnail.url);
                    // console.log(thumbnailNames);
                    // Create buttons for each result
                    const buttons = results.map((result, index) => {
                        const button = 
                                new ButtonBuilder()
                                    .setCustomId(`starttracking_;_${result.title}`) // Unique ID for each button
                                    .setLabel(`${result.title}`)
                                    .setStyle(ButtonStyle.Primary) // Use ButtonStyle.Primary for the button style
                          
                            return button;
                    });
                    const row = new ActionRowBuilder().addComponents(buttons);
                    // Send embeds with buttons
                    await interaction.reply({ embeds, files: attachment, components: [row], });
                } catch (e) {
                    error(e)
                    return interaction.reply(`Error fetching results: ${e.message}`, { ephemeral: true });
                }
            }
        } catch (e) {
            return interaction.reply(`${e}`, { ephemeral: true });
        }
    },
};