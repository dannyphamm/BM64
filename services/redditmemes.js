const { WebhookClient } = require('discord.js');

const loadRedditMemes = async (client) => {
    async function sendMeme() {
        const fetch = await import('node-fetch');

        fetch.default('https://meme-api.com/gimme')
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
            .catch(error => {
                console.error('Error fetching meme:', error);
            });
    }

    // Send a meme every 10 minutes at the 0, 10, 20, 30, 40, and 50-minute marks
    setInterval(sendMeme, 10 * 60 * 1000);
}

module.exports = {
    loadRedditMemes: function (client) {
        loadRedditMemes(client)
    }
}



