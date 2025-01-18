const config = require('../config.json');
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { error, log } = require('../utils/utils');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (config.mode !== 'DEV') {
            const { client } = message;
            let misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo)
            if(message.author.bot) return;
            if (message.type === 0 && message.channelId === config.spotifyChannel) {
                try {
                    const spotifyUrlPattern = /https?:\/\/(?:open|play)\.spotify\.com\/(?:track|playlist|album)\/(\w+)/;
                    const match = message.content.match(spotifyUrlPattern);
                    if (match) {
                        await message.react('🔄');
                        const spotifyApi = await spotify();
                        const spotifyId = match[1];
                        
                        // Get existing tracks
                        const currentTracks = await misamo.find().toArray();
                        const existingUris = currentTracks.map(song => song.uri);
                        const existingSignatures = currentTracks.map(song => 
                            `${song.name}___${song.artists}`.toLowerCase()
                        );

                        if (message.content.includes('/track/')) {
                            const song = await spotifyApi.getTrack(spotifyId);
                            const songUri = `spotify:track:${spotifyId}`;
                            const songSignature = `${song.body.name}___${song.body.artists.map(artist => artist.name).join(', ')}`.toLowerCase();

                            // Check both URI and name+artists combination
                            if (!existingUris.includes(songUri) && !existingSignatures.includes(songSignature)) {
                                log("TRACK ADD", spotifyId);
                                await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, [songUri]);
                                await misamo.insertOne({
                                    uri: songUri,
                                    name: song.body.name,
                                    artists: song.body.artists.map(artist => artist.name).join(', ')
                                });
                                await message.reactions.removeAll();
                                await message.react('✅');
                            } else {
                                await message.reactions.removeAll();
                                await message.react('❌');
                                // Optionally notify which type of duplicate it is
                                if (existingUris.includes(songUri)) {
                                    await message.reply('This exact track is already in the playlist.');
                                } else {
                                    await message.reply('A version of this song is already in the playlist.');
                                }
                            }
                        } else if (message.content.includes('/playlist/') || message.content.includes('/album/')) {
                            const data = message.content.includes('/playlist/') 
                                ? await getAllPlaylistSongs(spotifyId) 
                                : await spotifyApi.getAlbumTracks(spotifyId);

                            const newData = message.content.includes('/playlist/') 
                                ? data.map(song => ({
                                    uri: song.track.uri,
                                    name: song.track.name,
                                    artists: song.track.artists.map(artist => artist.name).join(', ')
                                })) 
                                : data.body.items.map(song => ({
                                    uri: song.uri,
                                    name: song.name,
                                    artists: song.artists.map(artist => artist.name).join(', ')
                                }));

                            // Filter out both URI and name+artists duplicates
                            const newSongs = newData.filter(song => {
                                const songSignature = `${song.name}___${song.artists}`.toLowerCase();
                                return !existingUris.includes(song.uri) && !existingSignatures.includes(songSignature);
                            });

                            if (newSongs.length > 0) {
                                log("PLAYLIST ADD", newSongs);
                                await misamo.insertMany(newSongs);
                                await spotifyApi.addTracksToPlaylist(
                                    config.spotifyPlaylist, 
                                    newSongs.map(song => song.uri)
                                );
                            }

                            // Reply with status for each track
                            for (const song of newData) {
                                const songSignature = `${song.name}___${song.artists}`.toLowerCase();
                                const isDuplicateUri = existingUris.includes(song.uri);
                                const isDuplicateSong = existingSignatures.includes(songSignature);
                                
                                const reply = await message.reply(
                                    `${song.name} - ${song.artists} ${isDuplicateUri ? '(Exact duplicate)' : 
                                    isDuplicateSong ? '(Different version exists)' : ''}`
                                );
                                await reply.react((!isDuplicateUri && !isDuplicateSong) ? '✅' : '❌');
                            }

                            await message.reactions.removeAll();
                            await message.react('✅');
                        }
                    }
                } catch (e) {
                    await message.reactions.removeAll();
                    error(e);
                    await message.react('❌');
                }
            }
        }
    }
};