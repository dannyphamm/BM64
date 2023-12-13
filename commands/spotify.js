const { SlashCommandBuilder } = require('@discordjs/builders');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
const { log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const { spotify } = require('../utils/spotify.js');
const { loadSpotify } = require('../services/spotifyStatus.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify Grant'),
    async execute(interaction) {
        const { client } = interaction;
        //load spotify
        loadSpotify(client, true)
        await interaction.reply({ content: 'Spotify granted!', ephemeral: true });
    },
};