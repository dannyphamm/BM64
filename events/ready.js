const { TwitterApi, ETwitterStreamEvent } = require('twitter-api-v2');
const { twitterauth } = require('../config.json');
module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log('Ready!');
        const twitterClient = new TwitterApi(twitterauth)
        const chan = client.guilds.cache.get('231053118463410177').channels.cache.get('1012412212071125022')
        const webhooks1 = await chan.fetchWebhooks();
        const webhook1 = webhooks1.first();
        await twitterClient.v2.updateStreamRules({
            add: [
                { value: 'from:hourly_shitpost' },
            ],
        });

        const stream = await twitterClient.v2.searchStream({
            expansions: ["attachments.media_keys"],
            "media.fields": ["url", "variants"]
        })

        stream.on(ETwitterStreamEvent.Error, error => {
            console.log(error)
        })
        stream.on(ETwitterStreamEvent.Data, data => {
            webhook1.send({
                username: 'Shitposter',
                avatarURL: 'https://i.imgur.com/wSTFkRM.png',
                files: [ {
                    attachment: data.includes?.media[0]?.variants?.filter(data => data.content_type === "video/mp4").sort((a, b) => b.bit_rate - a.bit_rate)[0]?.url
                }]
            })
        })
    },
};

