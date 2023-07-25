const config = require('../config.json');
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (config.mode !== 'DEV') {
      if (message.channel.type === 2 && message.content !== 'All messages sent in this text channel will automatically disappear after 15 minutes.') {
        setTimeout(() => {
          message.delete()
        }, 900000)
      }
    }
    
  },
};