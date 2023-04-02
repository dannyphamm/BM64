const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('toggle')
    .setDescription('Toggle a BM64 module!').addStringOption(option =>
      option
        .setName('module')
        .setDescription('Name of module').setRequired(true).setAutocomplete(true)),
  async execute(interaction) {
    return interaction.reply('Pong!');
  },
};




