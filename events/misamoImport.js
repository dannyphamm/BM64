const config = require('../config.json');
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { error, log } = require('../utils/utils');
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        let misamo = message.client.mongodb.db.collection(config.mongodbDBMiSaMo)
        if (message.type === 0 && message.channelId === config.spotifyChannel) {
            try {
                const spotifyUrlPattern = /https?:\/\/(?:open|play)\.spotify\.com\/(?:track|playlist|album)\/(\w+)/;
                const match = message.content.match(spotifyUrlPattern);
                if (match) {

                    await message.react('🔄');
                    const spotifyApi = await spotify();
                    // Extract the Spotify ID from the URL
                    const spotifyId = match[1];
                    const currentTrackUris = await misamo.find().toArray();
                    // Check if the URL is for a track or a playlist
                    if (message.content.includes('/track/')) {
                        const songInCollection = await misamo.findOne({ uri: `spotify:track:${spotifyId}` });
                        if (!songInCollection) {
                            // Add the track to the playlist
                            // Log the track ID
                            log("TRACK ADD", spotifyId)
                            await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, [`spotify:track:${spotifyId}`]);
                            // Get the track information
                            const song = await spotifyApi.getTrack(spotifyId);
                            // Add the track URI to the collection
                            await misamo.insertOne({
                                uri: `spotify:track:${spotifyId}`,
                                name: song.body.name,
                                artists: song.body.artists.map(artist => artist.name).join(', ')
                            });
                            await message.reactions.removeAll();
                            await message.react('✅');
                        } else {
                            //Duplicate emoji
                            await message.reactions.removeAll();
                            message.react('❌')
                        }
                    } else if (message.content.includes('/playlist/') || message.content.includes('/album/')) {

                        // Get the tracks in the playlist or album
                        const data = message.content.includes('/playlist/') ? await getAllPlaylistSongs(spotifyId) : await spotifyApi.getAlbumTracks(spotifyId);
                        
                        // Extract the track URIs and names
                        const newData = message.content.includes('/playlist/') ? data.map(song => ({
                            uri: song.track.uri,
                            name: song.track.name,
                            artists: song.track.artists.map(artist => artist.name).join(', ')
                        })) : data.body.items.map(song => ({
                            uri: song.uri,
                            name: song.name,
                            artists: song.artists.map(artist => artist.name).join(', ')
                        }));

                        const existingUris = currentTrackUris.map(song => song.uri);
                        // Filter the songs in the playlist
                        const newSongs = newData.filter(song => !existingUris.includes(song.uri));
                        const newSongDocuments = newSongs.map(song => ({
                            uri: song.uri,
                            name: song.name,
                            artists: song.artists
                        }));

                        // Log trackUris
                        log("PLAYLIST ADD", newSongDocuments)
                        const newSongUris = newSongs.map(song => song.uri);
                        if (newSongDocuments.length > 0) {
                            await misamo.insertMany(newSongDocuments);
                            await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, newSongUris);
                        }

                        for (const song of newData) {
                            const wasAdded = newSongUris.includes(song.uri);
                            const reply = await message.reply(`${song.name} - ${song.artists}`);
                            await reply.react(wasAdded ? '✅' : '❌');
                        }
                        await message.reactions.removeAll();
                        await message.react('✅');
                    }
                }
            } catch (e) {
                await message.reactions.removeAll();
                error(e)
                await message.react('❌');
            }

        }
    }
};