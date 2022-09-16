const { TwitterApi, ETwitterStreamEvent } = require('twitter-api-v2');
const { twitterauth } = require('../config.json');

const loadTwitter = async (client) => {
    console.log('LOAD TWITTER!');
    const twitterClient = new TwitterApi(twitterauth)
    await twitterClient.v2.updateStreamRules({
        add: [
            { value: 'has:video_link (from:hourly_shitpost OR from:dannypham13 OR from:hi1ar10us OR from:Lmfaoos OR from:30SECVlDEOS) ', tag: 'from:memes' }
        ],
    });

    // const deleteRules = await twitterClient.v2.updateStreamRules({
    //     delete: {
    //         ids: ['1568255837180956673', '1570632737014546433'],
    //     },
    // });
    const rules = await twitterClient.v2.streamRules();

    // Log every rule ID
    console.log(rules.data.map(rule => rule.id));
    const stream = await twitterClient.v2.searchStream({
        expansions: ["attachments.media_keys"],
        "media.fields": ["url", "variants"]
    })
    stream.autoReconnect = true;
    stream.on(ETwitterStreamEvent.Error, error => {
        console.log("ERROR", error)
    })
    stream.on(ETwitterStreamEvent.Data, async (data) => {
        client.guilds.cache.forEach(async (guild) => {
            let text = await guild.channels.cache.find(c => c.name === 'hourly-shitposts')
            if (!text) return;
            const webhooks = await text.fetchWebhooks()
            if (webhooks.size === 0) return;
            const webhooktoken = webhooks.find(wh => wh.token)
            console.log("hourly-shitposts", "Sending data  to: " + guild.name)
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
    loadTwitter: function (client) {
        loadTwitter(client)
    }
}