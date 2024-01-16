const { error } = require('../utils/utils');
const { loadSpotify } = require('../services/spotifyStatus');
const { socketIO } = require('../utils/socket.js');
const config = require('../config.json');

const queue = [];

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        const { client } = message;
        if (message.author.bot) return;
        if (message.type !== 0) return;
        if (message.channel.id === config.misamoVoiceChannel) {
            const song = message.content;

            // Add the song to the queue
            queue.push({ song, message });

            // Process the queue if it's not already being processed
            if (queue.length === 1) {
                processQueue(client);
            }
        }
    }
};

async function processQueue(client) {
    while (queue.length > 0) {
        const { song, message } = queue[0];

        // React with a loading emoji
        const loadingReaction = await message.react('🔄').catch((e) => error(e));

        // Emit the addSongToQueue event
        await socketIO().then(async (socket) => {
            const result = await socket.timeout(10000).emitWithAck('addSongToQueue', song);
            if (result) {
                await message.react('✅').catch((e) => error(e));
                // get queue
                await loadSpotify(client, true);
            } else {
                await message.react('❌').catch((e) => error(e));
            }

            // Remove the loading emoji
            await loadingReaction.remove().catch((e) => error(e));
        })

        // Remove the song from the queue
        queue.shift();
    }
}