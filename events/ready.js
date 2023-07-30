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
            log("WordOfTheDay: Scheduled job to run every day at 1:30 PM.")
            schedule.scheduleJob('0 30 13 * * *', async () => {
                try {
                    
                    await wordOfTheDayService(client);
                } catch (e) {
                    error(e);
                }
            });
            log("Memes, Facts, KdramaTracker: Scheduled job to run every 5 minutes.")
            schedule.scheduleJob('0 */5 * * * *', async () => {
                try {
                    
                    await redditMemesService(client);
                    await randomFactsService(client);
                    await kdramaTrackerService(client);
                } catch (e) {
                    error(e);
                }
            });
            log("UniqloTracker: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                 
                    await trackUniqloItems(client);
                } catch (e) {
                    error(e);
                }
            });
            log("UniqloTracker: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                    await femaleSaleItems(client);
                    await maleSaleItems(client);
                } catch (e) {
                    error(e);
                }
            });
        }
        //femaleSaleItems(client);
        log('Ready!');
    },
};


