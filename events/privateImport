const config = require('../config.json');
const { spotify, getAllPlaylistSongs } = require('../utils/spotifyprivate.js');
const { error, log } = require('../utils/utils.js');
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        const { client } = message;
        let privatedb = client.mongodb.db.collection(config.mongodbPrivateSpotify)
        if (message.type === 0 && message.channelId === config.spotifyPrivateChannel) {
            try {
                const spotifyApi = await spotify();
                await spotifyApi.searchTracks(message.content).then(async (data) => {
                    const song = data.body.tracks.items[0];
                    const songInCollection = await privatedb.findOne({ uri: song.uri });
                    if (!songInCollection) {
                        // Add the track to the playlist
                        // Log the track ID
                        log("TRACK ADD", song.uri)
                        await spotifyApi.addTracksToPlaylist(config.spotifyPrivatePlaylist, [song.uri]);
                        // Get the track information
                        // Add the track URI to the collection
                        await privatedb.insertOne({
                            uri: song.uri,
                            name: song.name,
                            artists: song.artists.map(artist => artist.name).join(', ')
                        });
                        await message.reactions.removeAll();
                        await message.react('✅');
                    } else {
                        //Duplicate emoji
                        await message.reactions.removeAll();
                        message.react('❌')
                    }
                }
                )
            } catch (e) {
                await message.reactions.removeAll();
                error(e)
                await message.react('❌');
            }

        }
    }
};