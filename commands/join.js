module.exports = {
  name: "join",
  run: async (client, message, args) => {
    if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
    try {
      message.member.voice.channel.join();
    } catch (e) {
      message.channel.send(`${client.emotes.error} | Error: \`${e}\``);
    }
  }
}