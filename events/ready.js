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
const { spotify, getAllPlaylistSongs } = require('../utils/spotify');



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

            log("Spotify Restart browser every 6 hours")
            schedule.scheduleJob('0 0 */6 * * *', async () => {
                try {
                    log("Refreshing Page")
                    await socketIO().then((socket)=> {
                        socket.emit('refreshPage');
                    })
                } catch (e) {
                    error(e, "Refresh Spotify");
                }
            });
            log("Spotify Play Music after restart 6 hours")
            schedule.scheduleJob('30 0 */6 * * *', async () => {
                try {
                    log("Playing Music")
                    await socketIO().then((socket)=> {
                        socket.emit('playMusic');
                    })
                    loadSpotify(client, true);
                } catch (e) {
                    error(e, "Spotify play music");
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
            log("Health check for spotify. 30 seconds")
            schedule.scheduleJob('*/30 * * * * *', async () => {
                try {
                    await socketIO().then((socket)=> {
                        socket.emit('playMusic');
                    })
                } catch (e) {
                    error(e, "TRY spotify health");
                }
            });

            socketIO();

            const delay = async () => {
                await new Promise(resolve => { setTimeout(resolve, 5000) });
                loadSpotify(client, true)
            }
            delay()
            log("Socket.io listening on port 3000")
        }
       
        log('Ready!');
    },
};


