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
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync').setDescription("sync spotify songs"))
        .setDescription('Spotify commands'),
    async execute(interaction) {
        const { client } = interaction;
        //load spotify
        const spotifyApi = await spotify();
        // const songs = await getAllPlaylistSongs(config.spotifyPrivatePlaylist);
        // import to mongodb in spotify collection
        const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
        const songs = await spotifyCollection.find({}).toArray();
        const songUris = songs.map(song => song.uri);
        // import songs into spotifyCollection
        await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, songUris);
        //console.log song uri

    },
};