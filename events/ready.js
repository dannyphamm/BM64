const { log, error } = require('../utils/utils')
const schedule = require('node-schedule');
const config = require('../config.json');
const { randomFactsService } = require('../services/randomfacts');
const { redditMemesService } = require('../services/redditmemes');
const { wordOfTheDayService } = require('../services/wordoftheday');
const { kdramaTrackerService, kdramaCompleterService } = require('../services/kdrama');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../services/uniqlo');
const { loadSpotify } = require('../services/spotifyStatus');
const { socketIO } = require('../utils/socket');


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
            schedule.scheduleJob('30 32 * * * *', async () => {
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
            socketIO().listen(3000);
            const delay = async () => {
                await new Promise(resolve => { setTimeout(resolve, 5000) });
                loadSpotify(client)
            }
            delay()
            socketIO().on('connection', (socket) => {
                log('a user connected');
                socket.on('disconnect', () => {
                    log('user disconnected');
                });
                socket.on('skipMusic', async () => {
                    loadSpotify(client);
                });
            });

            log("Socket.io listening on port 3000")
        }
        loadSpotify(client);
        log('Ready!');

    },
};


