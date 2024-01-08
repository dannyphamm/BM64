const { SlashCommandBuilder } = require('@discordjs/builders');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
const { log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const { spotify, getAllPlaylistSongs } = require('../utils/spotify.js');
const { loadSpotify } = require('../services/spotifyStatus.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify').addSubcommand(subcommand =>
            subcommand.setName('sync')
                .setDescription('Syncs the mongodb to the spotify playlist')
        )
        .setDescription('Spotify related commands'),
    async execute(interaction) {
        const { client } = interaction;
        const subcommand = interaction.options.getSubcommand();
        const spotifyApi = await spotify();
        if (subcommand === 'sync') {
          
            //load spotify
            // const songs = await getAllPlaylistSongs(config.spotifyPrivatePlaylist);
            // import to mongodb in spotify collection
            const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
            const songs = await spotifyCollection.find({}).toArray();
            log(songs.length);
            const songUris = songs.map(song => song.uri);
            log(songs)
            // import songs into spotifyCollection
            await spotifyApi.addTracksToPlaylist(config.spotifyPlaylist, songUris);
            //console.log song uri
            return interaction.reply('Spotify Synced!');
        }
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