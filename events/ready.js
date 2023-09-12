const { log, error } = require('../utils/utils')
const schedule = require('node-schedule');
const config = require('../config.json');
const { randomFactsService } = require('../services/randomfacts');
const { redditMemesService } = require('../services/redditmemes');
const { wordOfTheDayService } = require('../services/wordoftheday');
const { kdramaTrackerService, kdramaCompleterService } = require('../services/kdrama');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../services/uniqlo');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {

        if (config.mode !== 'DEV') {

            log("WordOfTheDay:  Scheduled job to run every day at 1:30 PM.")
            schedule.scheduleJob('0 30 13 * * *', async () => {
                try {
                    
                    await wordOfTheDayService(client);
                } catch (e) {
                    error(e, "TRY WORD OF THE DAY");
                }
            });

            log("Kdrama Completer: Scheduled job to run every day at 33 Minutes.")
            schedule.scheduleJob('0 33 * * * *', async () => {
                try {
                    
                    await kdramaCompleterService(client);
                } catch (e) {
                    error(e, "TRY KDRAMACOMPLETER");
                }
            });

            log("Memes, Facts, Kdrama Tracker: Scheduled job to run every 5 minutes.")
            schedule.scheduleJob('0 */5 * * * *', async () => {
                try {
                    await kdramaTrackerService(client);
                    await redditMemesService(client);
                    await randomFactsService(client);
                   
                } catch (e) {
                    error(e, "TRY MEMES, FACTS, KDRAMA");
                }
            });
            log("UniqloTracker: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                 
                    await trackUniqloItems(client);
                } catch (e) {
                    error(e, "TRY UNIQLO SINGLE ITEMS");
                }
            });
            log("UniqloTracker: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                    await femaleSaleItems(client);
                    await maleSaleItems(client);
                } catch (e) {
                    error(e, "TRY UNIQLO");
                }
            });
        }
        log('Ready!');
    },
};


