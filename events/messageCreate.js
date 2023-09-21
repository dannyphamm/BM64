const config = require('../config.json');
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (config.mode !== 'DEV') {
      if (message.channel.type === 2) {
if(message.content == 'All messages sent in this text channel will automatically disappear after 15 minutes.') return;
if(message.embeds){
if (message.embeds[0].title == 'Recently Played')
return;
}


        setTimeout(() => {
          message.delete()
        }, 900000)
      }
    }
    
  },
};