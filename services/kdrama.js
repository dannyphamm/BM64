/**
 * K-drama tracker (kissasian.cam → MongoDB → #movie-night webhook).
 *
 * Scheduled from events/ready.js:
 *   - kdramaTrackerService   — every 5 minutes
 *   - kdramaCompleterService — once daily (~33 min past the hour)
 *
 * ─── kdramaCompleterService (new-drama discovery) ───────────────────────────
 * 1. Fetch Historical South-Korea series lists from kissasian.cam:
 *      - Ongoing (new dramas that are still airing)
 *      - Completed (dramas that appear already finished — never went Ongoing)
 * 2. Parse article titles / link / banner from each page.
 * 3. Load all dramas already stored in MongoDB.
 * 4. For each scraped title: skip if it already exists.
 * 5. Insert new titles into DB:
 *      - Ongoing  → isCompleted:false (+ Discord notify)
 *      - Completed → isCompleted:true; Discord notify only if ≤3 new titles
 *        (larger batches are silent backfill so the archive page doesn't spam)
 * 6. Post a Discord webhook embed to #movie-night when notifying.
 *
 * ─── kdramaTrackerService (episode / completion updates) ────────────────────
 * 1. Fetch kissasian.cam home page (Latest Release section).
 * 2. Walk articles bottom-up; parse drama title + episode number from img title.
 * 3. Look up title in MongoDB; only act on tracked, non-completed dramas.
 * 4a. No episode yet → set initial episode/link/banner and notify ("tracking started").
 * 4b. Higher episode than DB → update and notify ("new episode").
 * 5. If the article has a Completed status badge → mark isCompleted in DB and notify.
 *
 * ─── sendEpisodeNotification ────────────────────────────────────────────────
 * Shared helper: download banner, build embed + Watch now button, send via bot webhook.
 */

const cheerio = require('cheerio');
const axios = require('axios');
const config = require('../config');
const { AttachmentBuilder, ButtonBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { log, error } = require('../utils/utils');

const ONGOING_SERIES_URL =
    'https://kissasian.cam/series/?genre%5B%5D=historical&country%5B%5D=south-korea&status=Ongoing&type=&order=latest';
const COMPLETED_SERIES_URL =
    'https://kissasian.cam/series/?genre%5B%5D=historical&country%5B%5D=south-korea&status=completed&type=drama&order=latest';

async function fetchSeriesPage(url) {
    try {
        const response = await axios.get(url);
        if (response.status !== 200) {
            error(`Kdrama series fetch failed (${response.status}): ${url}`);
            return null;
        }
        return response.data;
    } catch (e) {
        error(`Unable to fetch ${url}`);
        return null;
    }
}

/** Parse series list cards into { title, link, banner }. */
function parseSeriesArticles(html) {
    const $ = cheerio.load(html);
    const seen = new Set();
    const dramas = [];

    $('article img').each((_, el) => {
        const title = $(el).attr('title');
        if (!title || seen.has(title)) return;
        seen.add(title);

        const dramaElement = $(el).closest('a');
        dramas.push({
            title,
            link: dramaElement.attr('href'),
            banner: $(el).attr('src') || dramaElement.find('img').attr('src'),
        });
    });

    return dramas;
}

async function getMovieNightWebhook(client) {
    const channel = await client.channels.cache.find((c) => c.name === 'movie-night');
    if (!channel) return null;

    const webhooks = await channel.fetchWebhooks();
    if (webhooks.size === 0) return null;

    const botWebhook = webhooks.find((webhook) => webhook.owner.id === client.user.id);
    if (!botWebhook) return null;

    return new WebhookClient({ id: botWebhook.id, token: botWebhook.token });
}

async function announceNewDrama(client, { title, banner, link, isCompleted }) {
    const webhook = await getMovieNightWebhook(client);
    if (!webhook) return;

    const files = [];
    const embed = new EmbedBuilder()
        .setTitle(isCompleted ? `New Completed Drama:\n${title}` : `New Drama Detected:\n${title}`)
        .setDescription(
            isCompleted
                ? 'This drama appeared as completed (never went Ongoing). Full series is available!'
                : 'This drama is now available!'
        )
        .setColor(isCompleted ? 0x7289da : '#0099ff')
        .setTimestamp();

    if (banner) {
        try {
            const buffer = await axios(banner, { responseType: 'arraybuffer' }).then((r) => r.data);
            files.push(new AttachmentBuilder(Buffer.from(buffer), { name: 'discordjs.jpg' }));
            embed.setThumbnail('attachment://discordjs.jpg');
        } catch (e) {
            error(e, `Failed to download banner for ${title}`);
        }
    }

    const components = [];
    if (link) {
        const button = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Watch now')
            .setURL(link);
        const row = new ActionRowBuilder().addComponents(button);

        if (!isCompleted) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`markComplete_${title.replace(/[^a-zA-Z0-9]/g, '_')}`)
                    .setLabel('Mark Complete')
                    .setStyle(ButtonStyle.Success)
            );
        }
        components.push(row);
    }

    await webhook.send({
        embeds: [embed],
        ...(files.length ? { files } : {}),
        ...(components.length ? { components } : {}),
    });
}

/** Discover new ongoing + instantly-completed dramas and announce them in Discord. */
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

    
    const kdramaCollection = client.mongodb.db.collection(config.mongodbDBKDrama);
    const existingKdramas = await kdramaCollection.find().toArray();
    const knownTitles = new Set(existingKdramas.map((drama) => drama.title));

    const lists = [
        { url: ONGOING_SERIES_URL, isCompleted: false, label: 'ongoing' },
        // Instant / dump releases that never appear under Ongoing
        { url: COMPLETED_SERIES_URL, isCompleted: true, label: 'completed' },
    ];

    for (const list of lists) {
        const html = await fetchSeriesPage(list.url);
        if (!html) continue;

        const dramas = parseSeriesArticles(html);
        log(`Kdrama ${list.label} list: ${dramas.length} title(s)`);

        // Completed page can be a long archive. Only notify when a small number of
        // brand-new titles appear (typical for instant dumps). Larger batches are
        // treated as a silent DB backfill so we don't spam #movie-night.
        const newcomers = dramas.filter((d) => !knownTitles.has(d.title));
        const notifyNewcomers =
            !list.isCompleted || newcomers.length <= 3;

        if (list.isCompleted && newcomers.length > 3) {
            log(
                `Kdrama completed backfill: seeding ${newcomers.length} title(s) without Discord notify`
            );
        }

        for (const drama of newcomers) {
            knownTitles.add(drama.title);
            await kdramaCollection.insertOne({
                title: drama.title,
                banner: drama.banner,
                link: drama.link,
                isCompleted: list.isCompleted,
            });

            if (notifyNewcomers) {
                await announceNewDrama(client, {
                    title: drama.title,
                    banner: drama.banner,
                    link: drama.link,
                    isCompleted: list.isCompleted,
                });
            }

            log(
                list.isCompleted
                    ? `New instantly-completed drama: ${drama.title}${notifyNewcomers ? '' : ' (seeded)'}`
                    : `New entry created for title: ${drama.title}`
            );
        }
    }
}

/** Check Latest Release for new episodes / completion on tracked dramas. */
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
        // Skip if we can't parse the episode number
        if (isNaN(ep)) continue;
        
        const existingKDrama = await kdramaCollection.findOne({ title });
        
        if (existingKDrama && !existingKDrama.isCompleted) {
            // Handle episode updates first
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

            // Now check for completion status
            const isCompleted = $(article).find('.status.Completed').length > 0;
            
            if (isCompleted) {
                // Update database to mark as completed
                await kdramaCollection.updateOne(
                    { title },
                    { $set: { isCompleted: true } }
                );

                // Send completion notification
                const embed = new EmbedBuilder()
                    .setTitle(`${title}`)
                    .setDescription(`This drama has completed!`)
                    .addFields(
                        { name: 'Total Episodes', value: `${ep}`, inline: true },
                    )
                    .setColor(0x7289da)
                    .setTimestamp();
                let attachment;
                if (existingKDrama.banner) {
                    attachment = new AttachmentBuilder(existingKDrama.banner, { name: 'discordjs.jpg' });
                    embed.setThumbnail('attachment://discordjs.jpg');
                }

                const channel = await client.channels.cache.find(c => c.name === 'movie-night');
                if (!channel) continue;
                
                const webhooks = await channel.fetchWebhooks();
                if (webhooks.size === 0) continue;
                
                const webhook = webhooks.find(wh => wh.owner.id === client.user.id);
                if (!webhook) continue;

                await webhook.send({
                    embeds: [embed],
                    ...(existingKDrama.banner ? { files: [attachment] } : {})
                });

                log(`Marked "${title}" as completed`);
            }
        }
    }
};

/** Post episode (or first-tracking) notification to #movie-night via bot webhook. */
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

