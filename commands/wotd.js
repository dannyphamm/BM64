const fetch = require('node-fetch');
const Discord = require('discord.js');
const config = require('../config.json');


module.exports = {
  name: "wotd",
  once: true,
  run: async (client, message, args) => {
    const msg = await message.channel.send(`${client.emotes.loading} | Pinging...`);
    const wotd = await fetch(`https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=${config.wordofDayKey}`)
    const json = await wotd.json();
    const word = json.word;
    const def = json.definitions[0].text;
    const example = json.examples[0].text;
    msg.edit(`${client.emotes.success} | Word of the Day: \`${word}\`\nDefinition: \`${def}\`\nExample: \`${example}\``);
  }
}