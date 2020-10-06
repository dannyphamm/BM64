exports.run = (client, message, args) => {
  if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
  try {
    const queue = client.distube.getQueue(message);
    console.log('```' + queue.songs + '```');
  } catch (e) {
    message.channel.send(`${client.emotes.error} | Error: \`${e}\``);
  }
};
