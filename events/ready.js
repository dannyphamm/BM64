const log = require('../utils/utils')
const randomFacts = require('../services/randomfacts');
const redditmemes = require('../services/redditmemes');
const twitter = require('../services/twitter');
const wordoftheday = require('../services/wordoftheday');
const kdrama = require('../services/kdrama');
const config = require('../config.json');
module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        // API Deprecated
        if (config.mode !== 'DEV') {
            twitter.loadTwitter(client)
            redditmemes.loadRedditMemes(client)
            randomFacts.loadRandomFacts(client)
            wordoftheday.loadWordOfTheDay(client)
            kdrama.loadKdrama(client)
        }


        log('Ready!');
    },
};


