const { SlashCommandBuilder } = require('@discordjs/builders');
const lyrics = require("music-lyrics"); 
const { MessageEmbed } = require('discord.js');
module.exports = {
	data: new SlashCommandBuilder()
		.setName('lyrics')
		.setDescription('Lyrics of current song'),
	async execute(interaction) {
        const queue = interaction.client.distube.getQueue(interaction.guild.id);
        console.log(queue)
        try {
            const lyric = await lyrics.search(queue.songs[0].name);
            const embed = new MessageEmbed().setTitle(queue.songs[0].name).setDescription(lyric);
            return interaction.reply({embeds: [embed]});
        } catch (error) {
            return interaction.reply(`Unable to find lyrics for ${queue.songs[0].name}`);
        }
		
	},
};