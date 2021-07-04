const fetch = require('node-fetch');
const Discord = require('discord.js');
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    const channel = client.channels.cache.get('786226183276462110');

    try {
      const webhooks = await channel.fetchWebhooks();
      const webhook = webhooks.first();
      /**
     * Create embed message and send to chat
     */
      function tick() {
        const mins = new Date().getMinutes();
        const seconds = new Date().getSeconds();
        console.log(seconds)
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


