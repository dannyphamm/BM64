const fetch = require('node-fetch');
const Discord = require('discord.js');
const config = require('../config.json');
function createDefinitions(def) {
  const array = [];

  for (let i of def) {
    array.push(
      {
        name: `Source`,
        value: i.source,
        inline: true,
      },
      {
        name: `PartOfSpeech`,
        value: i.partOfSpeech,
        inline: true,
      },
      {
        name: `Text`,
        value: i.text,
        inline: true,
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false,
      },
    )
  }
  return array
}
function createExamples(example) {
  const array = [];

  for (let i of example) {
    array.push(
      {
        name: `Source`,
        value: `[${i.title}](${i.url})`,
        inline: true
      },
      {
        name: `Text`,
        value: i.text,
        inline: true
      },
      {
        name: '\u200b',
        value: '\u200b',
        inline: false
      },
    )
  }
  return array
}
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    const channel = client.channels.cache.get('786226183276462110');
    const wordofday = client.channels.cache.get(config.wordOfDayID)
    const fact = client.channels.cache.get(config.factChannelID)
    try {
      const webhooks1 = await wordofday.fetchWebhooks();
      const webhook1 = webhooks1.first();
      const webhooks = await channel.fetchWebhooks();
      const webhook = webhooks.first();
      const webhooks2 = await fact.fetchWebhooks();
      const webhook2 = webhooks2.first();
      /**
     * Create embed message and send to chat
     */
      function tick() {
        const mins = new Date().getMinutes();
        const seconds = new Date().getSeconds();
        const hours = new Date().getHours();
        if ((mins === 0 || mins % 10 === 0) && seconds == 0) {
          fetch('https://meme-api.herokuapp.com/gimme').then((response) => response.json()).then((data) => {
            const embed = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setURL(data.postLink)
              .setAuthor(data.author)
              .setTitle(data.title)
              .setImage(data.url)
              .setTimestamp()
              .setFooter('r/' + data.subreddit + ' | ' + data.author);
            webhook.send({
              username: 'Daily Memer',
              avatarURL: 'https://i.imgur.com/wSTFkRM.png',
              embeds: [embed],
            })
          });
          fetch('https://api.api-ninjas.com/v1/facts?limit=1', {headers: {'X-Api-Key': config.factKey }}).then((response) => response.json()).then((data) => {
            const embed1 = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setDescription(data[0].fact)
              .setTimestamp()
              .setFooter('Powered by BM64');
            webhook2.send({
              username: `Phalan's Facts`,
              avatarURL: 'https://i.imgur.com/wSTFkRM.png',
              embeds: [embed1],
            })
          });
        }

        if (hours === 13 && mins === 0 && seconds === 20) {
          console.log("trigger")
          fetch(`https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=${config.wordofDayKey}`).then((response) => response.json()).then((data) => {
            const embed0 = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setTitle(data.word)
              .setFooter('Powered by BM64');
            const embed = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setTitle(data.word + " Definitions")
              .addFields(
                createDefinitions(data.definitions),
                data.note && { name: 'Note', value: data.note },
              )
              .setFooter('Powered by BM64');
            const embed1 = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setTitle(data.word + " Examples")
              .addFields(
                createExamples(data.examples)
              )
              .setTimestamp()
              .setFooter('Powered by BM64');
            webhook1.send({
              username: 'Word Of The Day',
              avatarURL: 'https://i.imgur.com/wSTFkRM.png',
              embeds: [embed0, embed, embed1],
            })
          })
        }
      }

      setInterval(() => {
        tick()
      }, 1000);

    } catch (error) {
      console.error('Error trying to send: ', error);
    }
  }
}


