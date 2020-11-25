exports.run = (client, message, args) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
  const queue = client.distube.getQueue(message);
  if (queue.playing) {
    queue.playing = false;
    queue.connection.dispatcher.pause(true);
  }
  message.channel.send(`${client.emotes.success} | Now pausing: ${queue.songs[0].name}`);
};

