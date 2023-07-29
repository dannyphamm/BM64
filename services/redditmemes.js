const { WebhookClient } = require('discord.js');
const { error } = require('../utils/utils');

const redditMemesService = async (client) => {
        const fetch = await import('node-fetch');

        await fetch.default('https://meme-api.com/gimme')
            .then(response => response.json())
            .then(async data => {
                const exampleEmbed = {
                    title: data.title,
                    url: data.url,
                    image: {
                        url: data.url,
                    },
                    color: 0x7289da,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'r/' + data.subreddit + ' • ' + data.author + ' • ' + 'Powered by BM64',
                    }
                };
                const channel = await client.channels.cache.find(c => c.name === 'daily-memes');
                if (!channel) return;
                const webhooks = await channel.fetchWebhooks();
                if (webhooks.size === 0) return;
                const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                webhook.send({
                    embeds: [exampleEmbed],
                });
            })
            .catch(e => {
                error('Error fetching meme:', e);
            });
}

module.exports = { redditMemesService }



