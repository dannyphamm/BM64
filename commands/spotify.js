const { SlashCommandBuilder } = require('@discordjs/builders');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config.json');
const { log } = require('../utils/utils');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify Grant'),
    async execute(interaction) {
        // var scopes = ['user-read-currently-playing', 'user-read-playback-state'],
        //     redirectUri = config.spotifyRedirectURI,
        //     clientId = config.spotifyClientID,
        //     state = 'some-state-of-my-choice';

        // // Setting credentials can be done in the wrapper's constructor, or using the API object's setters.
        // var spotifyApi = new SpotifyWebApi({
        //     redirectUri: redirectUri,
        //     clientId: clientId
        // });

        // // Create the authorization URL
        // var authorizeURL = spotifyApi.createAuthorizeURL(
        //     scopes,
        //     state,
        //   );
          
        // log(authorizeURL);

        // return interaction.reply(`
		// 	Sent		
		// 	`);
        await socket.emit('playMusic')
        return interaction.reply(`Sent`);
    },
};