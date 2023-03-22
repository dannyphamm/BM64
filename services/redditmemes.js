const { WebhookClient } = require('discord.js');

const loadRedditMemes = async (client) => {
    async function sendHook() {
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
            .catch(error => {
                console.error('Error fetching meme:', error);
            });
    }

    const now = new Date();
    const nextMultipleOfTenMinutes = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.ceil(now.getMinutes() / 10) * 10);
    const timeUntilNextMultipleOfTenMinutes = nextMultipleOfTenMinutes - now;

    // Schedule first call to sendHook
    setTimeout(() => {
        sendHook();

        // Schedule subsequent calls to sendHook every ten minutes
        setInterval(sendHook, 10 * 60 * 1000);
    }, timeUntilNextMultipleOfTenMinutes);
}

module.exports = {
    loadRedditMemes: function (client) {
        loadRedditMemes(client)
    }
}



