const { WebhookClient } = require('discord.js');
const config = require("../config.json");
const { error } = require('../utils/utils');
function createDefinitions(data) {
    const array = [];
    for (let i of data.definitions) {
        array.push(
            {
                name: `Source`,
                value: i.source,
                inline: true,
            },
            {
                name: `PartOfSpeech`,
                value: i.partOfSpeech,
                inline: true,
            },
            {
                name: `Text`,
                value: i.text,
                inline: true,
            },
            {
                name: '\u200b',
                value: '\u200b',
                inline: false,
            },
        )
    }
    if (data.note) {
        array.push({ name: 'Note', value: data.note })
    }
    return array
}

function createExamples(example) {
    const array = [];

    for (let i of example) {
        array.push(
            {
                name: `Source`,
                value: `[${i.title}](${i.url})`,
                inline: true
            },
            {
                name: `Text`,
                value: i.text,
                inline: true
            },
            {
                name: '\u200b',
                value: '\u200b',
                inline: false
            },
        )
    }
    return array
}
const wordOfTheDayService = async (client) => {
    await fetch(`https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=${config.wordofDayKey}`)
        .then(response => response.json())
        .then(async data => {
            const word = {
                title: data.word.charAt(0).toUpperCase() + data.word.slice(1),
                url: data.url,
                color: 0x7289da,
                footer: {
                    text: 'Powered by BM64',
                }
            };
            const definitions = {
                title: data.word.charAt(0).toUpperCase() + data.word.slice(1) + " Definitions",
                color: 0x7289da,
                fields: createDefinitions(data),
                footer: {
                    text: 'Powered by BM64',
                }
            };

            const examples = {
                title: data.word.charAt(0).toUpperCase() + data.word.slice(1) + " Examples",
                color: 0x7289da,
                fields: createExamples(data.examples),
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Powered by BM64',
                }
            };
            const channel = await client.channels.cache.find(c => c.name === '💬word-of-the-day💬');
            if (!channel) return;
            const webhooks = await channel.fetchWebhooks();
            if (webhooks.size === 0) return;
            const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
            webhook.send({
                embeds: [word, definitions, examples],
            });
        })
        .catch(e => {
            error('Error fetching meme:', e);
        });
}

module.exports = { wordOfTheDayService }


