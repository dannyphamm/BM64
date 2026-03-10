const config = require("../config.json");
//const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js_deprecate');
const { error, log } = require('../utils/utils');

const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');


const misamoAutoImport = async (client) => {
    let misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo)
    let mongodbDBMiSaMoAutoImport = client.mongodb.db.collection(config.mongodbDBMiSaMoAutoImport)

    let spotifyApi = await spotify()
    // Auto playlists
    const playlists = await mongodbDBMiSaMoAutoImport.find({ disable: { $ne: true } }).toArray();

    // Misamo tracks
    const misamoTracks = await misamo.find().toArray();
    const misamoUris = misamoTracks.map(song => song.uri);
    const misamoSignatures = misamoTracks.map(song => `${song.name}___${song.artists}`.toLowerCase());
    let newTracks = [];

    // Get all the songs from the auto playlists and finds tracks that are not in the misamo collection
    for (const playlist of playlists) { 
        const data = await getAllPlaylistSongs(playlist?.uri);

        const newData = data.map(song => {
            try {
                return {
                    uri: song.track.uri,
                    name: song.track.name,
                    artists: song.track.artists.map(artist => artist.name).join(', '),
                    playlist: playlist?.uri,
                };
            } catch (error) {
                console.error(`An error occurred with the following song: ${JSON.stringify(song, null, 2)}`);
                console.error(error);
            }
        });

        for (const song of newData) {
            const songSignature = `${song.name}___${song.artists}`.toLowerCase();
            if (!misamoUris.includes(song.uri) && !misamoSignatures.includes(songSignature)) {
                newTracks.push(song);
            }
        }
    }
    
    // Remove duplicates checking both URI and name+artists
    const seen = new Set();
    newTracks = newTracks.filter(song => {
        const signature = `${song.uri}___${song.name}___${song.artists}`.toLowerCase();
        if (seen.has(signature)) {
            return false;
        }
        seen.add(signature);
        return true;
    });

    // send a message in MiSaMo Import that a new song is detected
    if (newTracks.length > 0) {
        const channel = client.channels.cache.get(config.spotifyChannel);

        for (const song of newTracks) {
            const trackId = song.uri.replace('spotify:track:', '');
            const deleteButton = new ButtonBuilder()
                .setCustomId(`autodelete;${JSON.stringify({uri: song.uri})}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(deleteButton);
            log("TRACK ADD", trackId, song.playlist)
            

            await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, [`spotify:track:${trackId}`]);
            await misamo.insertOne(
                song
            );
            
            channel.send({ content: `**Auto Import: Detected new song ${song.name} - ${song.artists} **\nhttps://open.spotify.com/track/${trackId}`, components: [row] });
        }
    }
}

module.exports = { misamoAutoImport }
