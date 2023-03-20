const { WebhookClient } = require('discord.js');
function createDefinitions(def) {
    const array = [];

    for (let i of def.data) {
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
const loadWordOfTheDay = async (client) => {
    async function sendHook() {
        const fetch = await import('node-fetch');

        fetch.default(`https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=${config.wordofDayKey}`)
            .then(response => response.json())
            .then(async data => {
                const word = {
                    title: data.word,
                    url: data.url,
                    color: 0x7289da,
                    footer: {
                        text: 'Powered by BM64',
                    }
                };
                const definitions = {
                    title: data.word.charAt(0).toUppercase() + data.word.slice(1) + " Definitions",
                    color: 0x7289da,
                    fields: createDefinitions(data),
                    footer: {
                        text: 'Powered by BM64',
                    }
                };

                const examples = {
                    title: data.word.charAt(0).toUppercase() + data.word.slice(1) + " Examples",
                    color: 0x7289da,
                    fields: createExamples(data.examples),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'Powered by BM64',
                    }
                };
                const channel = await client.channels.cache.find(c => c.name === 'word-of-the-day');
                if (!channel) return;
                const webhooks = await channel.fetchWebhooks();
                if (webhooks.size === 0) return;
                const webhook = new WebhookClient({ id: webhooks.first().id, token: webhooks.first().token });
                webhook.send({
                    embeds: [word, definitions, examples],
                });
            })
            .catch(error => {
                console.error('Error fetching meme:', error);
            });
    }

    const now = new Date();
    let nextOneThirtyPM;
    if (now.getHours() < 13 || (now.getHours() == 13 && now.getMinutes() < 30)) { // If it's before 1 PM today
        nextOneThirtyPM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 30);
    } else { // If it's already past 1 PM today
        nextOneThirtyPM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 13, 30);
    }
    const timeUntilNextOneThirtyPM = nextOneThirtyPM - now;

    // Schedule first call to sendHook
    setTimeout(() => {
        sendHook();

        // Schedule subsequent calls to sendHook every day at one pm
        setInterval(sendHook, 24 * 60 * 60 * 1000);

    }, timeUntilNextOneThirtyPM);
}

module.exports = {
    loadWordOfTheDay: function (client) {
        loadWordOfTheDay(client)
    }
}



