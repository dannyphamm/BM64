const fetch = require('node-fetch');
const Discord = require('discord.js');
module.exports = (client) => {
  console.log('BM64 is Online');
  var isSent = false;
  function tick() {
    var mins = new Date().getMinutes();
    if (mins == "00" || mins % 10 == 00) {
      if (!isSent) {
        fetch('https://meme-api.herokuapp.com/gimme').then(response => response.json()).then(data => {
          const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setURL(data.postLink)
            .setAuthor(data.author)
            .setTitle(data.title)
            .setImage(data.url)
            .setTimestamp()
            .setFooter("r/" + data.subreddit + " | " + data.author);
          client.channels.cache.find(i => i.name === 'daily-memes').send(embed);
          isSent = true;
        })
      }
    } else {
      isSent = false;
    }
  }
  setInterval(tick, 5000);
};



