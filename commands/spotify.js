const { SlashCommandBuilder } = require('@discordjs/builders');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
const { log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { loadSpotify } = require('../services/spotifyStatus.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify Grant'),
    async execute(interaction) {
        // const { client } = interaction;
        // //load spotify
        // const spotifyApi = await spotify();
        // const songs = await getAllPlaylistSongs(config.spotifyPrivatePlaylist);
        // // import to mongodb in spotify collection
        // const spotifyCollection = client.mongodb.db.collection(config.mongodbPrivateSpotify);
        // // import songs into spotifyCollection
        // const songsData = songs.map(song => ({
        //     uri: song.track.uri,
        //     name: song.track.name,
        //     artists: song.track.artists.map(artist => artist.name),
        // }));
        // //console.log song uri
        // await spotifyCollection.insertMany(songsData);
        
    },
};