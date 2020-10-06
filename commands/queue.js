exports.run = (client, message, args) => {
  const queue = client.distube.getQueue(message);
  if (!queue) return message.channel.send(`${client.emotes.error} | There is nothing playing!`);
  const q = queue.songs.map((song, i) => {
    return `${i === 0 ? 'Playing:' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``;
  }).join('\n');
  message.channel.send(`${client.emotes.queue} | **Server Queue**\n${q}`);
};