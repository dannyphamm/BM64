const { error,log } = require('../utils/utils');
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
            log(`Prio Queue request: ${JSON.stringify(queue, null, 2)}`);
            // Process the queue if it's not already being processed
            if (queue.length === 1) {
                processQueue();
            }
        }
    }
};

async function processQueue() {
    while (queue.length > 0) {
        const { song, message } = queue[0];
        const { client } = message;
        // React with a loading emoji
        const loadingReaction = await message.react('🔄').catch((e) => error(e));

        // Emit the addSongToQueue event
        await socketIO().then(async (socket) => {
            const result = await socket.timeout(10000).emitWithAck('addSongToQueue', song);
            if (result) {
                await loadingReaction.remove().catch((e) => error(e));
                await message.react('✅').catch((e) => error(e));
                // get queue
                await loadSpotify(client, true);
            } else {
                await loadingReaction.remove().catch((e) => error(e));
                await message.react('❌').catch((e) => error(e));
            }

            // Remove the loading emoji
            await loadingReaction.remove().catch((e) => error(e));
        })

        // Remove the song from the queue
        queue.shift();
    }
}