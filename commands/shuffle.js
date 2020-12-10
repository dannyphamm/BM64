exports.run = (client, message) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
  distube.shuffle(message);
  message.channel.send(`${client.emotes.success} | Shuffled!`);
};

