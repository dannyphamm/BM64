const twitter = require('../services/twitter');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        
        twitter.loadTwitter(client)
        console.log('Ready!');
    },
};

