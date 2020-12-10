exports.run = (client, message, args) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  const string = args.join(' ');
  if (!string) return message.channel.send(`${client.emotes.error} | Please enter a song url or query to search.`);
  const queue = client.distube.getQueue(message);
  const song = queue.songs.splice(args[0], 1);
  message.channel.send(`Removed **${song[0].title}** from the Queue`);
};

