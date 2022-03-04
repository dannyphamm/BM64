const fetch = require('node-fetch');
const Discord = require('discord.js');
const config = require('../config.json');


module.exports = {
  name: "ping",
  once: true,
  run: async (client, message, args) => {
    const msg = await message.channel.send(`${client.emotes.loading} | Pinging...`);
    const ping = Math.round(msg.createdTimestamp - message.createdTimestamp);
    msg.edit(`${client.emotes.success} | Pong! \`${ping}ms\``);
  }
}