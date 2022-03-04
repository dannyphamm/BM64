const config = require("../config.json")
module.exports = {
  name: 'message',
  once: true,
  execute(message) {
    const prefix = config.prefix
    if (!message.content.startsWith(prefix)) return
    const args = message.content.slice(prefix.length).trim().split(/ +/g)
    const command = args.shift().toLowerCase()
    const cmd = message.client.commands.get(command) || message.client.commands.get(message.client.aliases.get(command))
    if (!cmd) return
    if (cmd.inVoiceChannel && !message.member.voice.channel) return message.channel.send(`${message.client.emotes.error} | You must be in a voice channel!`)
    try {
      cmd.run(message.client, message, args)
    } catch (e) {
      console.error(e)
      message.reply(`Error: ${e}`)
    }
  },
};

