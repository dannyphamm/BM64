const config = require('../config.json');
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (config.mode !== 'DEV') {
      if (message.channel.type === 2) {
        if (message.content == 'All messages sent in this text channel will automatically disappear after 15 minutes.') return;
        if (message.embeds.length > 0 && message.author.id == message.client.user.id) return;

        setTimeout(() => {
          message.delete()
        }, 900000)
      }
    }
  },
};