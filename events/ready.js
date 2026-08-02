const { log, error } = require('../utils/utils')
const schedule = require('node-schedule');
const config = require('../config.json');
const { randomFactsService } = require('../services/randomfacts');
const { redditMemesService } = require('../services/redditmemes');
const { wordOfTheDayService } = require('../services/wordoftheday');
const { vaccineService } = require('../services/vaccine');
const { kdramaTrackerService, kdramaCompleterService } = require('../services/kdrama');
const { trackUniqloItems, femaleSaleItems, maleSaleItems } = require('../services/uniqlo');
const { loadSpotify } = require('../services/spotifyStatus');
const { socketIO } = require('../utils/socket');
//const { misamoAutoImport } = require('../services/misamoAutoImport');
const { uniqloStreamService } = require('../services/uniqlostream');
const { palworldUpdateService } = require('../services/palworldUpdate');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {

        if (config.mode !== 'DEV') {
            log("Vaccine: Scheduled job to run every 11PM")
            schedule.scheduleJob('0 0 23 * * *', async () => {
                try {
                    await vaccineService(client);
                } catch (e) {
                    error(e, "TRY VACCINE");
                }
            });
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

            log("Palworld Steam update check: every 10 minutes.")
            schedule.scheduleJob('0 */10 * * * *', async () => {
                try {
                    await palworldUpdateService(client);
                } catch (e) {
                    error(e, "TRY PALWORLD UPDATE");
                }
            });
            // Seed / check once shortly after boot
            setTimeout(() => {
                palworldUpdateService(client).catch((e) => error(e, "TRY PALWORLD UPDATE BOOT"));
            }, 15000);

            // log("Spotify Restart browser every 8 hours")
            // schedule.scheduleJob('0 0 */8 * * *', async () => {
            //     try {
            //         log("Refreshing Page")
            //         const refreshResponse = await socketIO().then((socket) => {
            //             return socket.timeout(3000).emitWithAck('refreshPage');
            //         })

            //         if (refreshResponse) {
            //             log("Refreshing Page Success, loading spotify queue")
            //             const play = await socketIO().then(async (socket) => {
            //                 // wait 3 seconds
            //                 await new Promise(resolve => { 
            //                     log("Waiting 3 seconds to play music")
            //                     setTimeout(resolve, 3000) });
            //                     log("Playing Music socket call")
            //                 return socket.timeout(3000).emitWithAck('playMusic');
            //             })
            //             log("PlayMusic Response",play)
            //             if (play) {
            //                 //wait 3 seconds
            //                 await new Promise(resolve => {
            //                     log("Waiting 3 seconds to load spotify")
            //                     setTimeout(resolve, 3000) });
                            
            //                 log("PlayMusic Success, loading spotify queue")
            //                 loadSpotify(client, true)
            //             }
            //         }
            //         //misamoAutoImport(client);
            //     } catch (e) {
            //         error(e, "Refresh Spotify");
            //     }
            // });

            log("UniqloTracker: Scheduled job to run 15 minutes.")
            schedule.scheduleJob('0 */15 * * * *', async () => {
                try {
                    await femaleSaleItems(client);
                    await maleSaleItems(client);
                } catch (e) {
                    error(e, "TRY UNIQLO");
                }
            });
            // log("Health check for spotify. 1 minute")
            // schedule.scheduleJob('0 * * * * *', async () => {
            //     try {
            //         await socketIO().then(async (socket) => {
            //             const result = await socket.timeout(10000).emitWithAck('playMusic');
            //         })
            //     } catch (e) {
            //         error(e, "TRY spotify health");
            //     }
            // });
            socketIO();
            log(`Socket.io listening on ${process.env.SOCKET_HOST || '127.0.0.1'}:${process.env.SOCKET_PORT || 3000}`)
            const delay = async () => {
                // await spotify();
                await new Promise(resolve => { setTimeout(resolve, 5000) });
                await loadSpotify(client, true);
            }
            delay().catch((e) => error(e, "Spotify status boot"));
            uniqloStreamService(client).catch((e) => error(e, "TRY UNIQLO STREAM"));
            
            // Start LoL Tracker service
            if (client.lolTracker) {
                client.lolTracker.start();
                log('LoL Tracker service started');
            }
                
    
        }
        log('Ready!');
    },
};


