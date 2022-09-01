const { TwitterApi, ETwitterStreamEvent } = require('twitter-api-v2');
const { twitterauth } = require('../config.json');
const util = require('util')


const loadTwitter = async (client) => {
    console.log('LOAD TWITTER!');
    const twitterClient = new TwitterApi(twitterauth)
    await twitterClient.v2.updateStreamRules({
        add: [
            { value: 'from:hourly_shitpost' },
        ],
    });

    const stream = await twitterClient.v2.searchStream({
        expansions: ["attachments.media_keys"],
        "media.fields": ["url", "variants"]
    })
    stream.autoReconnect = true;
    stream.on(ETwitterStreamEvent.Error, error => {
        console.log(util.inspect(error, true, 10))
    })
    stream.on(ETwitterStreamEvent.Data, data => {
        client.guilds.cache.forEach(async (guild) => {
            let text = guild.channels.cache.find(c => c.name === 'hourly-shitposts')
            if (!text) return
            const webhooks = await text.fetchWebhooks()
            const webhooktoken = webhooks.find(wh => wh.token)
            webhooktoken.send({
                username: 'Shitposter',
                avatarURL: 'https://i.imgur.com/wSTFkRM.png',
                files: [{
                    attachment: data.includes?.media[0]?.variants?.filter(data => data.content_type === "video/mp4").sort((a, b) => b.bit_rate - a.bit_rate)[0]?.url
                }]
            })
        })

    })
}

module.exports = { 
    loadTwitter: function(client) {
        loadTwitter(client)
    }
 }