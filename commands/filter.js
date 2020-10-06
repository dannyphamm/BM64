exports.run = (client, message, args) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  let mode = null;
  switch (args[0]) {
    case '3d':
      mode = '3d';
      break;
    case 'bassboost':
      mode = 'bassboost';
      break;
    case 'echo':
      mode = 'echo';
      break;
    case 'flanger':
      mode = 'flanger';
      break;
    case 'gate':
      mode = 'gate';
      break;
    case 'haas':
      mode = 'haas';
      break;
    case 'karaoke':
      mode = 'karaoke';
      break;
    case 'nightcore':
      mode = 'nightcore';
      break;
    case 'reverse':
      mode = 'reverse';
      break;
    case 'vaporwave':
      mode = 'vaporwave';
      break;
  }
  const filter = distube.setFilter(message, mode);
  message.channel.send(`${client.emotes.repeat} | Current queue filter: " + (${filter} || "Off")`);
};
