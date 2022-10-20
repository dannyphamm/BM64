const { TwitterApi, ETwitterStreamEvent } = require('twitter-api-v2');
const { twitterauth } = require('../config.json');

const loadTwitter = async (client) => {
    console.log('LOAD TWITTER!');
    const twitterClient = new TwitterApi(twitterauth)
    const rules = await twitterClient.v2.streamRules();
    console.log(rules.data.map(rule => rule.id))
    const deleteRules = await twitterClient.v2.updateStreamRules({
        delete: {
            ids: rules.data.map(rule => rule.id),
        },
    });
    await twitterClient.v2.updateStreamRules({
        add: [
            { value: 'has:video_link (from:hourly_shitpost OR from:dannypham13 OR from:hi1ar10us OR from:Lmfaoos OR from:30SECVlDEOS OR from:BeratStuff OR from:hourly_absurd)', tag: 'from:memes' },
            { value: 'has:media (from:ShapedInternet OR from:dannypham13)', tag: 'from:internet' }
        ],
    });


    

    // Log every rule ID
    console.log(rules.data.map(rule => rule.id));
    const stream = await twitterClient.v2.searchStream({
        expansions: ["attachments.media_keys"],
        "media.fields": ["url", "variants"]
    })

    stream.on(ETwitterStreamEvent.Error, error => {
        console.dir(error, { depth: null })
        stream.close()
        setTimeout(() => {
            console.log("reconnecting")
            stream.reconnect()
        }, 20000);
    })

    stream.on(ETwitterStreamEvent.Data, async (data) => {
        client.guilds.cache.forEach(async (guild) => {
            if (data.matching_rules.some(e => e.tag === "from:memes")) {
                let text = await guild.channels.cache.find(c => c.name === 'hourly-shitposts')
                if (!text) return;
                const webhooks = await text.fetchWebhooks()
                if (webhooks.size === 0) return;
                const webhooktoken = webhooks.find(wh => wh.token)
                webhooktoken.send({
                    username: 'Shitposter',
                    avatarURL: 'https://i.imgur.com/wSTFkRM.png',
                    files: [{
                        attachment: data.includes?.media[0]?.variants?.filter(data => data.content_type === "video/mp4").sort((a, b) => b.bit_rate - a.bit_rate)[0]?.url
                    }]
                }).catch(error => {
                    console.log("File too big")
                })
            }
            if (data.matching_rules.some(e => e.tag === "from:internet")) {
                let text = await guild.channels.cache.find(c => c.name === 'shaped-internet')
                if (!text) return;
                const webhooks = await text.fetchWebhooks()
                if (webhooks.size === 0) return;
                const webhooktoken = webhooks.find(wh => wh.token)
                webhooktoken.send({
                    username: 'The Internet',
                    avatarURL: 'https://i.imgur.com/wSTFkRM.png',
                    files: [{
                        attachment: data.includes?.media.some(e=> e.type=== "photo") ? data.includes?.media[0]?.url : data.includes?.media[0]?.variants?.filter(data => data.content_type === "video/mp4").sort((a, b) => b.bit_rate - a.bit_rate)[0]?.url
                    }]
                }).catch(error => {
                    console.log("File too big")
                })
            }
        })

    })
}

module.exports = {
    loadTwitter: function (client) {
        loadTwitter(client)
    }
}