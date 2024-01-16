const config = require('../config.json');
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { error, log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const { loadSpotify } = require('../services/spotifyStatus.js');
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        const { client } = message;
        if (message.author.bot) return;
        if (message.type !== 0) return;
        if (message.channel.id === config.misamoVoiceChannel) {
            const song = message.content;

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
        }
    }
};