const fetch = require('node-fetch');
const Discord = require('discord.js');
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    const channel = client.channels.cache.get('786226183276462110');

    try {
      /**
     * Create embed message and send to chat
     */
       const embed =  new Discord.MessageEmbed().setTitle('Back Online')
       .setColor('#0099ff');
      function tick() {
        const mins = new Date().getMinutes();
        const seconds = new Date().getSeconds();
        if ((mins === 0 || mins % 10 === 0) && seconds == 0) {
          fetch('https://meme-api.herokuapp.com/gimme').then((response) => response.json()).then((data) => {
           embed = new Discord.MessageEmbed()
              .setColor('#0099ff').setDescription("test")
              .setURL(data.postLink)
              .setAuthor(data.author)
              .setTitle(data.title)
              .setImage(data.url)
              .setTimestamp()
              .setFooter('r/' + data.subreddit + ' | ' + data.author);
          });
        }
      }
      setInterval(tick, 30000);
      const webhooks = await channel.fetchWebhooks();
      const webhook = webhooks.first();

      await webhook.send( {
        username: 'Daily Memer',
        avatarURL: 'https://i.imgur.com/wSTFkRM.png',
        embeds: [embed],
      });

    } catch (error) {
      console.error('Error trying to send: ', error);
    }


  }
}


