const Discord = require('discord.js');

exports.run = (client, message, args) => {
  const embed = new Discord.MessageEmbed()
      .setTitle(`Commands`)
      .setDescription(client.commands.map((cmd) => `\`${cmd.name}\``).join(', '))
      .setTimestamp();
  message.channel.send(embed);
};
