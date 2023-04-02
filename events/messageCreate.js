const sentMessages = new Map();
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.channel.type === 2) {
      setTimeout(() => {
        message.delete()
      }, 900000)
    }
  },
};