const log = require('../utils/utils')
const randomFacts = require('../services/randomfacts');
const redditmemes = require('../services/redditmemes');
const twitter = require('../services/twitter');
const wordoftheday = require('../services/wordoftheday');
const kdrama = require('../services/kdrama');
const config = require('../config.json');
const { trackUniqloItems } = require('../services/uniqlo');
const schedule = require('node-schedule');
module.exports = {
    name: 'ready',
    once: true,
    execute(client) {

        if (config.mode !== 'DEV') {
            // API Deprecated
            //twitter.loadTwitter(client)
            redditmemes.loadRedditMemes(client)
            randomFacts.loadRandomFacts(client)
            wordoftheday.loadWordOfTheDay(client)
            kdrama.loadKdrama(client)
        }
        console.log("UniqloTracker: Scheduled job to run every hour.")
        schedule.scheduleJob('0 * * * * *', async () => {
            try {
                await trackUniqloItems(client);
            } catch (error) {
                console.error(error);
            }
        });
        log('Ready!');
    },
};


