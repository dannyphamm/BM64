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
    .addSubcommand(subcommand =>
      subcommand.setName('test')
        .setDescription('Test')
    )
    .setDescription('Spotify related commands'),
  async execute(interaction) {
    const { client } = interaction;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'sync') {
      let count = 0;
      await interaction.deferReply({ ephemeral: true });
      let spotifyApi = await spotify();
      const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
      // Fetch the tracks from your Spotify playlist
      const playlistTracks = await getAllPlaylistSongs(config.spotifyPlaylist);
      // Extract the URIs of the tracks
      const playlistUris = playlistTracks.map(item => item.track.uri);

      // Fetch the tracks from your Spotify collection that are not marked as "Auto: removed"
      const collectionTracks = await spotifyCollection.find({ status: { $ne: "Auto: removed" } }).toArray();

      // Extract the URIs of the tracks
      const collectionUris = collectionTracks.map(track => track.uri);

      // Find the URIs that are in the Spotify collection but not in the Spotify playlist
      const urisToAdd = collectionUris.filter(uri => !playlistUris.includes(uri));

      // Find the URIs that are in the Spotify playlist but not in the Spotify collection
      const urisToRemove = playlistUris.filter(uri => !collectionUris.includes(uri));
      log('Spotify Count:', playlistUris.length);
      log('Collection Count:', collectionUris.length);
      console.log('URIs to add:', urisToAdd);
      console.log('URIs to remove:', urisToRemove);
      // add new tracks to spotify playlist
      // if (urisToAdd.length > 0) {
      //   await addAllTracksToPlaylist(config.spotifyPlaylist, urisToAdd);
      //   count += urisToAdd.length;
      // }
      await interaction.editReply(`Done. Removed ${count} tracks from the playlist.`);
    }
    else if (subcommand === 'purge') {
      await spotify();
      const spotifyCollection = client.mongodb.db.collection(config.mongodbDBMiSaMo);
      const songs = await spotifyCollection.find({}).toArray();
      const songUris = songs.map(song => song.uri);
      await removeAllTracksFromPlaylist(config.spotifyPlaylist, songUris);
      await interaction.reply('Spotify Purged!');
    } else if (subcommand === 'autoimport') {
      await interaction.deferReply({ ephemeral: true });
      await misamoAutoImport(client);
      await interaction.editReply('Auto Importing!');
    }
    else if (subcommand === 'test') {
      let spotifyApi = await spotify();
      // Fetch the tracks from your Spotify playlist
      let playlistTracks = await getAllPlaylistSongs(config.spotifyPlaylist);

      // Find duplicates based on name and artists
      let duplicates = playlistTracks.reduce((acc, track) => {
        let duplicate = acc.find(item => item.track.name === track.track.name && item.track.artists[0].name === track.track.artists[0].name);
        if (duplicate) {
          duplicate.count++;
        } else {
          acc.push({ ...track, count: 1 });
        }
        return acc;
      }, []).filter(track => track.count > 1);

      // Display the duplicate tracks
      duplicates.forEach(track => {
        console.log(`Track: ${track.track.name}, Artist: ${track.track.artists[0].name}, Count: ${track.count}`);
      });
    }
  },
};