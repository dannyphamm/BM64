// exports.run = (client, message, args) => {
//   if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
//   if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
//   const queue = client.distube.getQueue(message);
//   if (queue.playing) {
//     queue.playing = false;
//     queue.connection.dispatcher.pause(true);
//   }
//   message.channel.send(`${client.emotes.success} | Now pausing: ${queue.songs[0].name}`);
// };

module.exports = {
  name: "pause",
  aliases: ["pause", "hold"],
  inVoiceChannel: true,
  run: async (client, message, args) => {
      const queue = client.distube.getQueue(message)
      if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`)
      if (queue.pause) {
          queue.resume()
          return message.channel.send("Resumed the song for you :)")
      }
      queue.pause()
      message.channel.send("Paused the song for you :)")
  }
}