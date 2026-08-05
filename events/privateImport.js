const config = require('../config.json');
const { tidal, searchTracks, addTrackToPlaylists } = require('../utils/tidalprivate.js');
const { error, log } = require('../utils/utils.js');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        const { client } = message;
        const privatedb = client.mongodb.db.collection(config.mongodbPrivateTidal);
        if (message.type === 0 && message.channelId === config.tidalPrivateChannel) {
            try {
                await tidal();
                const song = await searchTracks(message.content);
                if (!song) {
                    await message.reactions.removeAll();
                    return message.react('❌');
                }

                const songInCollection = await privatedb.findOne({ id: song.id });
                if (!songInCollection) {
                    // Main: append (await). Sister: async rebuild for Tesla.
                    log('TRACK ADD', song.id);
                    await addTrackToPlaylists(song.id);
                    await privatedb.insertOne({
                        id: song.id,
                        name: song.name,
                        artists: song.artists,
                        addedAt: new Date(),
                    });
                    await message.reactions.removeAll();
                    await message.react('✅');
                } else {
                    await message.reactions.removeAll();
                    message.react('❌');
                }
            } catch (e) {
                await message.reactions.removeAll();
                error(
                    'Tidal privateImport failed',
                    e.response?.status,
                    e.response?.data || e.message,
                    e.stack
                );
                await message.react('❌');
            }
        }
    },
};
