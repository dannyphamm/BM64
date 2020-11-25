exports.run = (client, message, args) => {
    if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
    if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
    const queue = client.distube.getQueue(message);
    if (!queue.playing) {
        queue.playing = true;
        queue.connection.dispatcher.resume();
    }
    message.channel.send(`${client.emotes.success} | Now resuming: ${queue.songs[0].name}`);
  };
  
  