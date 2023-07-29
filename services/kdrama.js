const cheerio = require('cheerio');
const config = require('../config');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { log } = require('../utils/utils');
const kdramaTrackerService = async (client) => {
    const fetch = await import('node-fetch');
    const response = await fetch.default(config.kdramaURL + "/AdvanceSearch", {
        "headers": {
            "content-type": "application/x-www-form-urlencoded",
        },
        "body": "dramaName=&actorName=&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=0&countries=1&countries=0&countries=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=1&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&genres=0&status=Ongoing&year=",
        "method": "POST"
    });


    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    // Extract the titles and episode numbers from the JSON data
    const kdramas = await kdramaCollection.find().toArray();

    const titles = kdramas.map(item => item.title);
    const episodes = kdramas.map(item => item.episode);
    const html = await response.text();
    const $ = cheerio.load(html);

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
            const buffer = await fetch.default(config.kdramaURL + imageURL).then(response => { return response.arrayBuffer() })
            log(`New title "${title}" found with episode ${newEpisodes[i]}.`);
            kdramaCollection.insertOne({ title, episode: newEpisodes[i], banner: buffer, link: config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i] });

            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`NEW DRAMA DETECTED:\n${title}`)
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
            kdramaCollection.updateOne({ _id: kdramas[index]._id }, { $set: { episode: newEpisodes[i] } });
            const imageURL = newBanner[i]
            const buffer = await fetch.default(config.kdramaURL + imageURL).then(response => { return response.arrayBuffer() })
            const imageBuffer = Buffer.from(buffer);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'discordjs.jpg' });
            const embed = new EmbedBuilder()
                .setTitle(`NEW EPISODE DETECTED:\n${title}`)
                .setDescription(`Episode ${newEpisodes[i]} is released`)
                .setColor(0x7289da)
                .setThumbnail('attachment://discordjs.jpg')
                .setTimestamp();
            const button = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Watch now')
                .setURL(config.kdramaURL + newLink[i] + "/Episode-" + newEpisodes[i]);
            const row = new ActionRowBuilder().addComponents(button);
            const channel = await client.channels.cache.find(c => c.name === '🍿movie-night');
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

module.exports = { kdramaTrackerService }

