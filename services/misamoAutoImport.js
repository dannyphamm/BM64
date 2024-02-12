const config = require("../config.json");
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { error, log } = require('../utils/utils');

const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');


const misamoAutoImport = async (client) => {
    let misamo = client.mongodb.db.collection(config.mongodbDBMiSaMo)
    let mongodbDBMiSaMoAutoImport = client.mongodb.db.collection(config.mongodbDBMiSaMoAutoImport)

    let spotifyApi = await spotify()
    // Auto playlists
    const playlists = await mongodbDBMiSaMoAutoImport.find().toArray();

    // Misamo tracks
    const misamoTracks = await misamo.find().toArray();
    const misamoUris = misamoTracks.map(song => song.uri);
    let newTracks = [];

    // Get all the songs from the auto playlists and finds tracks that are not in the misamo collection
    for (const playlist of playlists) { 
        const data = await getAllPlaylistSongs(playlist?.uri);

        const newData = data.map(song => {

            try {
                return {
                    uri: song.track.uri,
                    name: song.track.name,
                    artists: song.track.artists.map(artist => artist.name).join(', ')
                };
            } catch (error) {
                console.error(`An error occurred with the following song: ${JSON.stringify(song, null, 2)}`);
                console.error(error);
            }
        });

        for (const song of newData) {
            if (!misamoUris.includes(song.uri)) {
                newTracks.push(song);
            }
        }
    }
    // Remove duplicates
    newTracks = [...new Set(newTracks.map(song => song.uri))].map(uri => newTracks.find(song => song.uri === uri));
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
            log("TRACK ADD", trackId)
            

            await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, [`spotify:track:${trackId}`]);
            await misamo.insertOne(
                song
            );
            
            channel.send({ content: `**Auto Import: Detected new song**\nhttps://open.spotify.com/track/${trackId}`, components: [row] });
        }
    }
}

module.exports = { misamoAutoImport }


