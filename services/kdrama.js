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
    //         "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Ongoing&year=",
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
    //         "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Completed&year=",
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

    
    // Code for new drama detection
        const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
        const url = 'https://kissasian.cam/series/?genre%5B%5D=historical&country%5B%5D=south-korea&status=Ongoing&type=&order=latest';
        let data, status;
        try {
            const response = await axios.get(url);
            data = response.data;
            status = response.status;
            // If status code is not 200, return
            if (status !== 200) {
                error(`Error: ${status}`);
                return;
            }
        } catch (e) {
            error("Unable to fetch https://watchasia.is/category/korean-drama")
        }
        if(!data) {
            return
        }
        const $ = cheerio.load(data);
        const newTitles = $('article img').map((i, el) => $(el).attr('title')).get();
    
        // Get all existing titles from database
        const existingKdramas = await kdramaCollection.find().toArray();
        const existingTitles = existingKdramas.map(drama => drama.title);
    
        // Check for new titles
        for (const title of newTitles) {
            // Check if drama exists and is not completed
            const existingDrama = existingKdramas.find(drama => drama.title === title);
            if (existingDrama) {
                if (existingDrama.isCompleted) {
                    log(`Skipping "${title}" as it is marked as completed`);
                    continue; // Skip this title and move to next one
                }
                // If it exists but isn't completed, skip it anyway as it's not new
                continue;
            }

            // If we get here, it's a new drama that needs to be added
            const dramaElement = $(`img[title="${title}"]`).closest('a');
            const link = dramaElement.attr('href');
            const banner = dramaElement.find('img').attr('src');
            
            // Insert new drama into database
            await kdramaCollection.insertOne({ 
                title, 
                banner, 
                link,
                isCompleted: false 
            });
    
            // Send notification about new drama
            const buffer = await axios(banner, {
                responseType: 'arraybuffer'
            }).then(response => response.data);
    
            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`New Drama Detected:\n${title}`)
                .setDescription(`This drama is now available!`)
                .setColor('#0099ff')
                .setTimestamp()
                .setThumbnail('attachment://discordjs.jpg');
    
            const button = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Watch now')
                .setURL(link);
            const markCompleteButton = new ButtonBuilder()
                .setCustomId(`markComplete_${title.replace(/[^a-zA-Z0-9]/g, '_')}`) // sanitize title for custom ID
                .setLabel('Mark Complete')
                .setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(button,markCompleteButton);
    
            const channel = await client.channels.cache.find(c => c.name === 'movie-night');
            if (!channel) return;
            let webhooks = await channel.fetchWebhooks();
            if (webhooks.size === 0) return;
            
            // Find first webhook owned by the bot
            const botWebhook = webhooks.find(webhook => webhook.owner.id === client.user.id);
            if (!botWebhook) return;

            const webhook = new WebhookClient({ id: botWebhook.id, token: botWebhook.token });
            webhook.send({
                embeds: [embed],
                files: [attachment], 
                components: [row]
            });

            log(`New entry created for title: ${title}`);
        }
        // Filter and get all li tags with class show
        // const currentTitles = []; // Initialize an array to hold current titles
        // const titlePromises = $('.block.list > div > .list-content .filter-char li.country_1.status_Ongoing').map(async (index, element) => {
        //     const genre = $(element).data('genre');
        //     const title = $(element).find('a').text().trim();

        //     if ((Array.isArray(genre) && genre.includes('Historical')) || await kdramaCollection.findOne({ title, isCustom: true })) {  // Get the title text
        //         currentTitles.push(title); // Add title to currentTitles array
        //         //console.log(title)
        //         const existingKDrama = await kdramaCollection.findOne({ title });
        //         // If the title is not in the database, add it
        //         if (!existingKDrama) {
        //             const link = $(element).find('a').attr('href');
        //             //Go the link and get the image src url and save it to the database
        //             const { data, } = await axios.get("https://watchasia.is" + link);
        //             const $$ = cheerio.load(data);
        //             const imageURL = $$('.img img').attr('src');
        //             await kdramaCollection.insertOne({ title, banner: imageURL, isCompleted: false });
        //             const buffer = await axios(imageURL, {
        //                 responseType: 'arraybuffer'
        //             }).then(response => { return response.data })
        //             const imageBuffer = Buffer.from(buffer);
        //             const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
        //             const embed = new EmbedBuilder()
        //                 .setTitle(`New Drama Detected:\n ${title}`)
        //                 .setDescription(`This drama is now available!`)
        //                 .setColor('#0099ff')
        //                 .setTimestamp()
        //                 .setThumbnail('attachment://discordjs.jpg')

        //             const button = new ButtonBuilder()
        //                 .setStyle(ButtonStyle.Link)
        //                 .setLabel('Watch now')
        //                 .setURL("https://watchasia.is" + link);
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
        //             log(`New entry created for title: ${title}`);
        //         }
        //     }
        // }).get(); // Get the array of promises

        // await Promise.all(titlePromises); // Wait for all promises to resolve

        // // After the promises resolve, mark titles in the database that are not in the current title list as complete
        // const allKdramas = await kdramaCollection.find().toArray();
        // //console.log(currentTitles)
        // for (const kdrama of allKdramas) {
        //     if (!currentTitles.includes(kdrama.title) && kdrama.isCompleted === false) {

        //         await kdramaCollection.updateOne({ _id: kdrama._id }, { $set: { isCompleted: true } });
        //         log(`Marked "${kdrama.title}" as complete.`);
        //         const embed = new EmbedBuilder()
        //             .setTitle(`${kdrama.title}`)
        //             .setDescription(`This drama has completed!`)
        //             .addFields(
        //                 { name: 'Total Episodes', value: `${kdrama.episode}`, inline: true },
        //             )
        //             .setColor(0x7289da)
        //             .setThumbnail('attachment://discordjs.jpg')
        //             .setTimestamp();
        //         const channel = await client.channels.cache.find(c => c.name === 'movie-night');
        //         if (!channel) return;
        //         const webhooks = await channel.fetchWebhooks();
        //         if (webhooks.size === 0) return;
        //         const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
        //         webhook.send({
        //             embeds: [embed],
        //         });
        //     }
        // }
}

const kdramaTrackerService = async (client) => {
    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    const url = 'https://kissasian.cam/';
    let data, status;
    
    try {
        const response = await axios.get(url);
        data = response.data;
        status = response.status;
        if (status !== 200) {
            error(`Error: ${status}`);
            return;
        }
    } catch (e) {
        error("Unable to fetch https://kissasian.cam/")
        return;
    }
    
    if(!data) return;
    
    const $ = cheerio.load(data);
    
    // Get all articles in Latest Release section and convert to array
    const articles = $('.listupd.normal article').toArray().reverse(); // Reverse to process from bottom up
    
    for (const article of articles) {
        const fullTitle = $(article).find('img').attr('title');
        const title = fullTitle.split(' Episode ')[0];
        const ep = parseInt(fullTitle.split(' Episode ')[1]) || 0;
        log(title)
        // Skip if we can't parse the episode number
        if (isNaN(ep)) continue;
        
        const existingKDrama = await kdramaCollection.findOne({ title });
        
        if (existingKDrama && !existingKDrama.isCompleted) {
            // If no episode number exists in database, set it
            if (!existingKDrama.episode) {
                const link = $(article).find('a').attr('href');
                const banner = $(article).find('img').attr('src');
                
                await kdramaCollection.updateOne(
                    { title }, 
                    { 
                        $set: { 
                            episode: ep,
                            link: link,
                            banner: banner
                        } 
                    }
                );
                
                //Send notification for first episode tracking
                await sendEpisodeNotification(client, {
                    title,
                    episode: ep,
                    banner,
                    link,
                    isNew: false
                });
                
                log(`Set initial episode ${ep} for "${title}"`);
            }
            // Check if the episode number is greater than the database episode
            else if (ep > existingKDrama.episode) {
                const link = $(article).find('a').attr('href');
                const banner = $(article).find('img').attr('src');
                
                await kdramaCollection.updateOne(
                    { title }, 
                    { 
                        $set: { 
                            episode: ep,
                            link: link,
                            banner: banner
                        } 
                    }
                );
                
                //Send notification for new episode
                await sendEpisodeNotification(client, {
                    title,
                    episode: ep,
                    banner,
                    link,
                    isNew: true
                });
                
                log(`New episode ${ep} found for "${title}"`);
            }
        }
    }
};

// Helper function to send notifications
async function sendEpisodeNotification(client, { title, episode, banner, link, isNew }) {
    try {
        const buffer = await axios(banner, {
            responseType: 'arraybuffer'
        }).then(response => response.data);
        
        const imageBuffer = Buffer.from(buffer);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
        
        const embed = new EmbedBuilder()
            .setTitle(`${isNew ? 'NEW EPISODE DETECTED:' : 'EPISODE TRACKING STARTED:'}\n${title}`)
            .setDescription(`Episode ${episode} is now available!`)
            .setColor('#0099ff')
            .setTimestamp()
            .setThumbnail('attachment://discordjs.jpg');
            
        const button = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Watch now')
            .setURL(link);
            
        const row = new ActionRowBuilder().addComponents(button);
        
        const channel = await client.channels.cache.find(c => c.name === 'movie-night');
        if (!channel) return;
        
        const webhooks = await channel.fetchWebhooks();
        if (webhooks.size === 0) return;
        
        const webhook = webhooks.find(wh => wh.owner.id === client.user.id);
        if (!webhook) return;
        
        await webhook.send({
            embeds: [embed],
            files: [attachment],
            components: [row]
        });
    } catch (err) {
        error(err, `Failed to send notification for ${title} episode ${episode}`);
    }
}

module.exports = { kdramaTrackerService, kdramaCompleterService }

