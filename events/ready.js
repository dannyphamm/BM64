const {log, error} = require('../utils/utils')
const randomFacts = require('../services/randomfacts');
const redditmemes = require('../services/redditmemes');

const wordoftheday = require('../services/wordoftheday');
const kdrama = require('../services/kdrama');
const config = require('../config.json');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../services/uniqlo');
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
        log("UniqloTracker: Scheduled job to run every hour.")
        schedule.scheduleJob('* 0 * * * *', async () => {
            try {
                log("Running UniqloSale")
                await trackUniqloItems(client);
            } catch (e) {
                error(e);
            }
        });
        log("UniqloSale: Scheduled job to run every hour.")
        schedule.scheduleJob('* 0 * * * *', async () => {
            try {
                log("Running UniqloSale")
                await femaleSaleItems(client);
                await maleSaleItems(client);
            } catch (e) {
                error(e);
            }
        });
        // femaleSaleItems(client);
        // maleSaleItems(client);
        log('Ready!');
    },
};


