module.exports = {
  name: "shuffle",
  inVoiceChannel: true,
  run: async (client, message, args) => {
      const queue = client.distube.getQueue(message)
      if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`)
      try {
          queue.shuffle()
          message.channel.send(`${client.emotes.success} | Queue shuffled!`)
      } catch (e) {
          message.channel.send(`${client.emotes.error} | ${e}`)
      }
  }
}