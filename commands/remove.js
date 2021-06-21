exports.run = (client, message, args) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  const string = args.join(' ');
  if (!string) return message.channel.send(`${client.emotes.error} | Please enter a song url or query to search.`);
  const queue = client.distube.getQueue(message);
  const song = queue.songs.splice(args[0], 1);
  message.channel.send(`Removed **${song[0].title}** from the Queue`);
};

module.exports = {
  name: "autoplay",
  inVoiceChannel: true,
  run: async (client, message, args) => {
      const queue = client.distube.getQueue(message)
      if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing in the queue right now!`)
      try {
          const autoplay = queue.songs.splice[args[0], 1];
          message.channel.send(`${client.emotes.success} | AutoPlay: \`${autoplay ? "On" : "Off"}\``)
      } catch (e) {
          message.channel.send(`${client.emotes.error} | ${e}`)
      }
  }
}