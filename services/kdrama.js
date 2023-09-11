const cheerio = require('cheerio');
const axios = require('axios');
const config = require('../config');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { log, error } = require('../utils/utils');
const kdramaTrackerService = async (client) => {
    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    //Extract the titles and episode numbers from the JSON data
    const kdramas = await kdramaCollection.find().toArray();
    const response = await axios.post("https://kissasian.li/AdvanceSearch",
        "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Ongoing&year=",
        {
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                'cache-control': 'no-cache'
            }
        }).then(response => { return response.data });
    const titles = kdramas.map(item => item.title);
    const episodes = kdramas.map(item => item.episode);
    const $ = cheerio.load(response);

    // Extract the titles and episode numbers from the webpage
    const newTitles = $('.section.group.list .col.info p:nth-child(1) a').map((i, el) => $(el).text()).get();
    const newLink = $('.section.group.list .col.cover a').map((i, el) => $(el).attr('href')).get();
    const newBanner = $('.section.group.list .col.cover a img').map((i, el) => $(el).attr('src')).get();
    const newEpisodes = $('.section.group.list .col.info p:nth-child(3)').map((i, el) => parseInt($(el).text().trim().replace('Episode ', ''))).get();
    // Check if there is a new title and update the JSON data accordingly
    newTitles.forEach(async (title, i) => {
        const index = titles.indexOf(title);
        if (index === -1) {
            const imageURL = newBanner[i]
            const buffer = await axios(config.kdramaURL + imageURL, {
                responseType: 'arraybuffer'
            }).then(response => { return response.data })
            log(`New title "${title}" found with episode ${newEpisodes[i]}.`);
            kdramaCollection.insertOne({ title, episode: newEpisodes[i], banner: imageURL, link: newLink[i] + "/Episode-" + newEpisodes[i], isCompleted: false });

            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`NEW DRAMA DETECTED\n${title}`)
                .setDescription(`Episode ${newEpisodes[i]} is released`)
                .setColor(0x7289da)
                .setThumbnail('attachment://discordjs.jpg')
                .setTimestamp();
            const button = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Watch now')
                .setURL(config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i]);
            const row = new ActionRowBuilder().addComponents(button);
            const channel = await client.channels.cache.find(c => c.name === 'movie-night');
            if (!channel) return;
            const webhooks = await channel.fetchWebhooks();
            if (webhooks.size === 0) return;
            const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
            webhook.send({
                embeds: [embed],
                files: [attachment],
                components: [row]
            });
        } else if (newEpisodes[i] > episodes[index]) {

            log(`New episode ${newEpisodes[i]} found for title "${title}".`);
            kdramaCollection.updateOne({ _id: kdramas[index]._id }, { $set: { episode: newEpisodes[i], link: newLink[i] + "/Episode-" + newEpisodes[i] } });
            const imageURL = newBanner[i]
            const buffer = await axios(config.kdramaURL + imageURL, {
                responseType: 'arraybuffer'
            }).then(response => { return response.data })
            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`NEW EPISODE DETECTED\n${title}`)
                .setDescription(`Episode ${newEpisodes[i]} is released`)
                .setColor(0x7289da)
                .setThumbnail('attachment://discordjs.jpg')
                .setTimestamp();
            const button = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Watch now')
                .setURL(config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i]);
            const row = new ActionRowBuilder().addComponents(button);
            const channel = await client.channels.cache.find(c => c.name === 'movie-night');
            if (!channel) return;
            const webhooks = await channel.fetchWebhooks();
            if (webhooks.size === 0) return;
            const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
            webhook.send({
                embeds: [embed],
                files: [attachment],
                components: [row]
            });
        }
    });



}
const kdramaCompleterService = async (client) => {
    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    // Check if there are no completed titles and update the database accordingly
    const uncompletedTitles = await kdramaCollection.find({ isCompleted: false }).toArray();
    if (uncompletedTitles.length === 0) return;
    const completed = await axios.post("https://kissasian.li/AdvanceSearch",
        "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Completed&year=",
        {
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                'cache-control': 'no-cache'
            },
        }).then(response => { return response.data });
    const $completed = cheerio.load(completed);
    const foundTitles = $completed(".section.group.list .col.info p:nth-child(1) a").map((i, el) => $completed(el).text()).get();
    for (const title of uncompletedTitles) {

        if (foundTitles.length > 0) {
            foundTitles.includes(title.title) && log(`Found title "${title.title}", marking Complete`)
            await kdramaCollection.updateOne({ _id: title._id }, { $set: { isCompleted: true } });
            const buffer = await axios(config.kdramaURL + title.banner, {
                responseType: 'arraybuffer'
            }).then(response => { return response.data })
            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`${title.title}`)
                .setDescription(`This drama has been completed!`)
                .addFields(
                    { name: 'Total Episodes', value: `${title.episode}`, inline: true },
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
                files: [attachment]
            });
        }
    }
}
module.exports = { kdramaTrackerService, kdramaCompleterService}

