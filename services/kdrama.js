const cheerio = require('cheerio');
const axios = require('axios');
const config = require('../config');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { log, error } = require('../utils/utils');
const kdramaCompleterService = async (client) => {
    //     const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    //     //Extract the titles and episode numbers from the JSON data
    //     const kdramas = await kdramaCollection.find().toArray();
    //     const response = await axios.post(`${config.kdramaURL}/AdvanceSearch`,
    //         "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Ongoing&year=",
    //         {
    //             headers: {
    //                 "content-type": "application/x-www-form-urlencoded",
    //                 'cache-control': 'no-cache'
    //             }
    //         }).then(response => { return response.data });
    //     const titles = kdramas.map(item => item.title);
    //     const episodes = kdramas.map(item => item.episode);
    //     const $ = cheerio.load(response);

    //     // Extract the titles and episode numbers from the webpage
    //     let newTitles = $('.section.group.list .col.info p:nth-child(1) a').map((i, el) => $(el).text()).get();
    //     const newLink = $('.section.group.list .col.cover a').map((i, el) => $(el).attr('href')).get();
    //     const newBanner = $('.section.group.list .col.cover a img').map((i, el) => $(el).attr('src')).get();
    //     const newEpisodes = $('.section.group.list .col.info p:nth-child(3)').map((i, el) => parseInt($(el).text().trim().replace('Episode ', ''))).get();
    //     log("Checking for new kdramas", newTitles.length)
    //     //If database has this title and tracking is disabled, remove from newTitles
    //     newTitles = newTitles.filter((title, i) => {
    //         const index = titles.indexOf(title);
    //         // If the title is found in the database
    //         if (index !== -1) {
    //             // If the title is not being tracked, remove it from the newTitles array
    //             if (kdramas[index].stoptracking === true) {
    //                 log(`Title "${title}" found in database but tracking is disabled.`)
    //                 return false;

    //             };
    //         }
    //         return true;
    //     });
    //     // Log each new titles name after filtering
    //     newTitles.forEach((title) => {
    //         log(`New title "${title}" found.`)
    //     });

    //     //Check if there is a new title and update the JSON data accordingly
    //     newTitles.forEach(async (title, i) => {
    //         const index = titles.indexOf(title);
    //         if (index === -1) {
    //             const imageURL = newBanner[i]
    //             const buffer = await axios(config.kdramaURL + imageURL, {
    //                 responseType: 'arraybuffer'
    //             }).then(response => { return response.data })
    //             log(`New title "${title}" found with episode ${newEpisodes[i]}.`);
    //             kdramaCollection.insertOne({ title, episode: newEpisodes[i], banner: imageURL, link: newLink[i] + "/Episode-" + newEpisodes[i], isCompleted: false });

    //             const imageBuffer = Buffer.from(buffer);
    //             const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
    //             const embed = new EmbedBuilder()
    //                 .setTitle(`NEW DRAMA DETECTED\n${title}`)
    //                 .setDescription(`Episode ${newEpisodes[i]} is released`)
    //                 .setColor(0x7289da)
    //                 .setThumbnail('attachment://discordjs.jpg')
    //                 .setTimestamp();
    //             const button = new ButtonBuilder()
    //                 .setStyle(ButtonStyle.Link)
    //                 .setLabel('Watch now')
    //                 .setURL(config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i]);
    //             const row = new ActionRowBuilder().addComponents(button);
    //             const channel = await client.channels.cache.find(c => c.name === 'movie-night');
    //             if (!channel) return;
    //             const webhooks = await channel.fetchWebhooks();
    //             if (webhooks.size === 0) return;
    //             const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
    //             webhook.send({
    //                 embeds: [embed],
    //                 files: [attachment],
    //                 components: [row]
    //             });
    //         } else if (newEpisodes[i] > episodes[index]) {

    //             log(`New episode ${newEpisodes[i]} found for title "${title}".`);
    //             kdramaCollection.updateOne({ _id: kdramas[index]._id }, { $set: { episode: newEpisodes[i], link: newLink[i] + "/Episode-" + newEpisodes[i] } });
    //             const imageURL = newBanner[i]
    //             const buffer = await axios(config.kdramaURL + imageURL, {
    //                 responseType: 'arraybuffer'
    //             }).then(response => { return response.data })
    //             const imageBuffer = Buffer.from(buffer);
    //             const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
    //             const embed = new EmbedBuilder()
    //                 .setTitle(`NEW EPISODE DETECTED\n${title}`)
    //                 .setDescription(`Episode ${newEpisodes[i]} is released`)
    //                 .setColor(0x7289da)
    //                 .setThumbnail('attachment://discordjs.jpg')
    //                 .setTimestamp();
    //             const button = new ButtonBuilder()
    //                 .setStyle(ButtonStyle.Link)
    //                 .setLabel('Watch now')
    //                 .setURL(config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i]);
    //             const row = new ActionRowBuilder().addComponents(button);
    //             const channel = await client.channels.cache.find(c => c.name === 'movie-night');
    //             if (!channel) return;
    //             const webhooks = await channel.fetchWebhooks();
    //             if (webhooks.size === 0) return;
    //             const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
    //             webhook.send({
    //                 embeds: [embed],
    //                 files: [attachment],
    //                 components: [row]
    //             });
    //         }
    //     });



    // }
    // const kdramaCompleterService = async (client) => {
    //     const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    //     // Check if there are no completed titles and update the database accordingly
    //     const uncompletedTitles = await kdramaCollection.find({ isCompleted: false }).toArray();
    //     if (uncompletedTitles.length === 0) return;
    //     const completed = await axios.post(`${config.kdramaURL}/AdvanceSearch`,
    //         "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Completed&year=",
    //         {
    //             headers: {
    //                 "content-type": "application/x-www-form-urlencoded",
    //                 'cache-control': 'no-cache'
    //             },
    //         }).then(response => { return response.data });
    //     const $completed = cheerio.load(completed);
    //     const foundTitles = $completed(".section.group.list .col.info p:nth-child(1) a").map((i, el) => $completed(el).text()).get();
    //     for (const title of uncompletedTitles) {

    //         if (foundTitles.length > 0) {
    //             if (foundTitles.includes(title.title)) {

    //                 log(`Found title "${title.title}", marking Complete`)
    //                 await kdramaCollection.updateOne({ _id: title._id }, { $set: { isCompleted: true } });
    //                 const buffer = await axios(config.kdramaURL + title.banner, {
    //                     responseType: 'arraybuffer'
    //                 }).then(response => { return response.data })
    //                 const imageBuffer = Buffer.from(buffer);
    //                 const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
    //                 const embed = new EmbedBuilder()
    //                     .setTitle(`${title.title}`)
    //                     .setDescription(`This drama has completed!`)
    //                     .addFields(
    //                         { name: 'Total Episodes', value: `${title.episode}`, inline: true },
    //                     )
    //                     .setColor(0x7289da)
    //                     .setThumbnail('attachment://discordjs.jpg')
    //                     .setTimestamp();
    //                 const channel = await client.channels.cache.find(c => c.name === 'movie-night');
    //                 if (!channel) return;
    //                 const webhooks = await channel.fetchWebhooks();
    //                 if (webhooks.size === 0) return;
    //                 const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
    //                 webhook.send({
    //                     embeds: [embed],
    //                     files: [attachment]
    //                 });
    //             }
    //         }
    //     }

    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    // Code for new drama detection
    async function scrapeKoreanDrama() {
        const url = 'https://asianc.sh/category/korean-drama';
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Set the selects


        // Filter and get all li tags with class show
        const currentTitles = []; // Initialize an array to hold current titles
        $('.block.list > div > .list-content .filter-char li.country_1.status_Ongoing').each(async (index, element) => {
            const title = $(element).find('a').text().trim();  // Get the title text
            currentTitles.push(title); // Add title to currentTitles array
        });

        $('.block.list > div > .list-content .filter-char li.country_1.status_Ongoing').each(async (index, element) => {
            const title = $(element).find('a').text().trim();  // Get the title text

            const genre = $(element).data('genre'); // Assuming genre is a data attribute

            // Check if the genre includes "Historical"
            if (Array.isArray(genre) && genre.includes('Historical')) {

                const existingKDrama = await kdramaCollection.findOne({ title });
                if (!existingKDrama) {   
                    await kdramaCollection.insertOne({ title, isCompleted: false });
                    const embed = new EmbedBuilder()
                    .setTitle(`New Drama Detected: ${title}`)
                    .setDescription(`This drama is now available!`)
                    .setColor('#0099ff')
                    .setTimestamp()
                    .setFooter({ text: 'KDRAMA Tracker', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
                    const channel = await client.channels.cache.find(c => c.name === 'movie-night');
                    if (!channel) return;
                    const webhooks = await channel.fetchWebhooks();
                    if (webhooks.size === 0) return;
                    const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                    webhook.send({
                        embeds: [embed],
                    });
                    console.log(`New entry created for title: ${title}`);
                }

                // Mark titles in the database that are not in the current title list as complete
                const allKdramas = await kdramaCollection.find().toArray();
                for (const kdrama of allKdramas) {
                    if (!currentTitles.includes(kdrama.title) && kdrama.isCompleted === false) {
                        await kdramaCollection.updateOne({ _id: kdrama._id }, { $set: { isCompleted: true } });
                        console.log(`Marked "${kdrama.title}" as complete.`);
                        const embed = new EmbedBuilder()
                        .setTitle(`${title}`)
                        .setDescription(`This drama has completed!`)
                        .addFields(
                            { name: 'Total Episodes', value: `${kdrama.episode}`, inline: true },
                        )
                        .setColor(0x7289da)
                        .setThumbnail('attachment://discordjs.jpg')
                        .setTimestamp();
                        const channel = await client.channels.cache.find(c => c.name === 'movie-night');
                        if (!channel) return;
                        const webhooks = await channel.fetchWebhooks();
                        if (webhooks.size === 0) return;
                        const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                        webhook.send({
                            embeds: [embed],
                        });
                    }
                }
            }
        });

    }

    scrapeKoreanDrama()



}

const kdramaTrackerService = async (client) => {
    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    //Extract the titles and episode numbers from the JSON data
    const kdramas = await kdramaCollection.find().toArray();
    console.log(kdramas)
    async function scrapeKoreanDrama() {
        const url = 'https://asianc.sh/recently-added?page=1';
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Set the selects



        $('.switch-block.list-episode-item li a').each(async (index, element) => {
            const title = $(element).find('h3').text().trim();  // Get the title text
            console.log(title)
            const ep = $(element).find('.ep.SUB').text().trim().replace('EP ', '');
            console.log(ep)
            const existingKDrama = await kdramaCollection.findOne({ title });
            if (existingKDrama) {
                // Check if the episode number is greater than the database episode
                if (parseInt(ep) > existingKDrama.episode) {
                    const embed = new EmbedBuilder()
                        .setTitle(`New Episode Detected: ${title}`)
                        .setDescription(`Episode ${ep} is now available!`)
                        .setColor('#0099ff')
                        .setTimestamp()
                        .setFooter({ text: 'KDRAMA Tracker', iconURL: 'https://i.imgur.com/AfFp7pu.png' });

                    const channel = await client.channels.cache.find(c => c.name === 'movie-night');
                    if (!channel) return;
                    const webhooks = await channel.fetchWebhooks();
                    if (webhooks.size === 0) return;
                    const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                    webhook.send({
                        embeds: [embed],
                    });
                    // Update the episode number in the database
                    await kdramaCollection.updateOne({ title }, { $set: { episode: ep } });
                }
            }
            // const title = $(element).find('a').text().trim();  // Get the title text

            // const genre = $(element).data('genre'); // Assuming genre is a data attribute

            // // Check if the genre includes "Historical"
            // if (Array.isArray(genre) && genre.includes('Historical')) {
            //     // Print the classes and additional information for debugging
            //     const classes = $(element).attr('class');
            //     console.log(`Classes for li element ${index}: ${classes}`);
            //     console.log(`Title: ${title},  Genre: ${genre}`);

            //     // Push the information to the shows array
            //     shows.push({ title, genre });

        });
    }

    scrapeKoreanDrama()
}
//module.exports = { kdramaTrackerService,  }
module.exports = { kdramaTrackerService, kdramaCompleterService }

