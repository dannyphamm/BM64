const { SlashCommandBuilder } = require('@discordjs/builders');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
const { log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const { spotify, addAllTracksToPlaylist, getAllPlaylistSongs, removeAllTracksFromPlaylist } = require('../utils/spotify.js');
const { loadSpotify } = require('../services/spotifyStatus.js');
const { misamoAutoImport } = require('../services/misamoAutoImport.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify').addSubcommand(subcommand =>
            subcommand.setName('sync')
                .setDescription('Syncs the mongodb to the spotify playlist')
        ).addSubcommand(subcommand =>
            subcommand.setName('purge')
                .setDescription('Purge the spotify playlist')
        ).addSubcommand(subcommand =>
            subcommand.setName('autoimport')
                .setDescription('Auto import songs from spotify playlists to MiSaMo')
        )
        .setDescription('Spotify related commands'),
    async execute(interaction) {
        const { client } = interaction;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'sync') {
            await spotify();
            //load spotify
            // const songs = await getAllPlaylistSongs(config.spotifyPrivatePlaylist);
            // import to mongodb in spotify collection
            const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
            const songs = await spotifyCollection.find({}).toArray();
            const songUris = songs.map(song => song.uri);
            // import songs into spotifyCollection
            await interaction.deferReply({ ephemeral: true })
            await addAllTracksToPlaylist(config.spotifyPlaylist, songUris);
            //console.log song uri
            await  interaction.editReply('Spotify Synced!',{ ephemeral: true });
        }
        else if(subcommand === 'purge') {
            await spotify();
            const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
            const songs = await spotifyCollection.find({}).toArray();
            const songUris = songs.map(song => song.uri);
            await removeAllTracksFromPlaylist(config.spotifyPlaylist, songUris);
            await  interaction.reply('Spotify Purged!');
        } else if (subcommand === 'autoimport') {
            await interaction.deferReply({ ephemeral: true });
            await misamoAutoImport(client);
            await interaction.editReply('Auto Importing!');
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