const { WebhookClient } = require('discord.js');
const config = require("../config.json");
const { error, log } = require('../utils/utils');
const cheerio = require('cheerio'); 

const vaccineService = async (client) => {
    await fetch(config.SA)
        .then(response => response.text())
        .then(async data => {
            const $ = cheerio.load(data); // Load the HTML content into cheerio
            const elementText = $('#lit-page-updated').text(); // Use cheerio to find the element by ID and get its text
            
            // Extract the date part using a regular expression
            const dateRegex = /Page last updated: (\d{1,2} \w+ \d{4})/;
            const matches = elementText.match(dateRegex);
            
            if (matches && matches.length > 1) {
                // Parse the date string into a Date object
                const elementDateStr = matches[1]; // "18 July 2024"
                const elementDate = new Date(elementDateStr);
                

                const today = new Date();
                today.setHours(0, 0, 0, 0); // Ignore time part
                
                // Compare the dates
                if (elementDate.getTime() === today.getTime()) {
                    const exampleEmbed = {
                        description: "Services Australia has updated their vaccine information page. Please check the new information.",
                        color: 0x7289da,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'Powered by BM64',
                        }
                    };
                    const channel = await client.channels.cache.find(c => c.id === config.settingsDiscordId);
                    if (!channel) return;
                    const webhooks = await channel.fetchWebhooks();
                    if (webhooks.size === 0) return;
                    const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                    webhook.send({
                        embeds: [exampleEmbed],
                    });
                    return; // Skip the rest of the function
                }
            }
            
        })
}

module.exports = { vaccineService }



