const fetch = require('node-fetch');
const Discord = require('discord.js');
module.exports = (client) => {
  console.log('BM64 is Online');

  function tick() {
    //get the mins of the current time
    var mins = new Date().getMinutes();
    if (mins == "00" || mins == "30") {
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
      }
      )
    }
  }
  setInterval(tick, 1000);
};



