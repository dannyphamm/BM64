const randomFacts = require('../services/randomFacts');
const redditmemes = require('../services/redditmemes');
const twitter = require('../services/twitter');
const wordoftheday = require('../services/wordoftheday');
module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        // API Deprecated
        //twitter.loadTwitter(client)
        redditmemes.loadRedditMemes(client)
        randomFacts.loadRandomFacts(client)
        wordoftheday.loadWordOfTheDay(client)
        console.log('Ready!');
    },
};

