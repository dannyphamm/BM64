const { log, error } = require('../utils/utils')
const schedule = require('node-schedule');
const config = require('../config.json');
const { randomFactsService } = require('../services/randomfacts');
const { redditMemesService } = require('../services/redditmemes');
const { wordOfTheDayService } = require('../services/wordoftheday');
const { kdramaTrackerService } = require('../services/kdrama');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../services/uniqlo');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {

        if (config.mode !== 'DEV') {
            // API Deprecated
            //twitter.loadTwitter(client)
            schedule.scheduleJob('0 30 13 * * *', async () => {
                try {
                    log("WordOfTheDay: Scheduled job to run every day at 1:30 PM.")
                    await wordOfTheDayService(client);
                } catch (e) {
                    error(e);
                }
            });

            schedule.scheduleJob('0 */5 * * * *', async () => {
                try {
                    log("RedditMemes: Scheduled job to run every 5 minutes.")
                    await redditMemesService(client);
                    log("RandomFacts: Scheduled job to run every 5 minutes.")
                    await randomFactsService(client);
                    log("KdramaTracker: Scheduled job to run every 5 minutes.")
                    await kdramaTrackerService(client);
                } catch (e) {
                    error(e);
                }
            });

            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                    log("UniqloTracker: Scheduled job to run 15 minutes.")
                    await trackUniqloItems(client);
                } catch (e) {
                    error(e);
                }
            });
            log("UniqloSale: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                    log("UniqloTracker: Scheduled job to run 15 minutes.")
                    await femaleSaleItems(client);
                    await maleSaleItems(client);
                } catch (e) {
                    error(e);
                }
            });
        }

        log('Ready!');
    },
};


