const fetch = require('node-fetch');
const Discord = require('discord.js');
module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    let isSent = false;
    /**
     * Create embed message and send to chat
     */
    function tick() {
      const mins = new Date().getMinutes();
      if (mins === 0 || mins % 10 === 0) {
        if (!isSent) {
          fetch('https://meme-api.herokuapp.com/gimme').then((response) => response.json()).then((data) => {
            const embed = new Discord.MessageEmbed()
              .setColor('#0099ff')
              .setURL(data.postLink)
              .setAuthor(data.author)
              .setTitle(data.title)
              .setImage(data.url)
              .setTimestamp()
              .setFooter('r/' + data.subreddit + ' | ' + data.author);
            client.channels.cache.find((i) => i.name === 'daily-memes').send(embed);
            isSent = true;
          });
        }
      } else {
        isSent = false;
      }
    }
    setInterval(tick, 5000);
  }
}


