const redditmemes = require('../services/redditmemes');
const twitter = require('../services/twitter');
module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        // API Deprecated
        //twitter.loadTwitter(client)
        redditmemes.loadRedditMemes(client)
        console.log('Ready!');
    },
};

