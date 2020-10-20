exports.run = (client, message) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
  client.distube.stop(message);
  try {
    client.bot.close(false);
  } catch(e) {
    console.log(e);
  }
  message.channel.send(`${client.emotes.success} | Stopped!`);
};
