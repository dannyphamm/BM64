const { WebhookClient } = require('discord.js');
const config = require("../config.json");
const { error, log } = require('../utils/utils');
const randomFactsService = async (client) => {

    await fetch('https://api.api-ninjas.com/v1/facts?limit=1', { headers: { 'X-Api-Key': config.factKey } })
        .then(response => response.json())
        .then(async data => {
            if (data[0] && !data.hasOwnProperty('message')) {
                const exampleEmbed = {
                    description: data[0].fact,
                    color: 0x7289da,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'Powered by BM64',
                    }
                };
                const channel = await client.channels.cache.find(c => c.name === '💯phalans-facts💯');
                if (!channel) return;
                const webhooks = await channel.fetchWebhooks();
                if (webhooks.size === 0) return;
                const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                webhook.send({
                    embeds: [exampleEmbed],
                });
            }
        })
        .catch(e => {
            error('Error fetching meme:', e);
        });
}

module.exports = { randomFactsService }



