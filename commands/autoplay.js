exports.run = (client, message, args) => {
      if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`)
      if (!client.distube.isPlaying(message)) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`)
      let mode = null;
      switch (args[0]) {
        case "off":
          mode = 0
          break
        case "song":
          mode = 1
          break
        case "queue":
          mode = 2
          break
      }
      mode = client.distube.toggleAutoplay(message);
      message.channel.send(`${client.emotes.repeat} | Set Autoplay to \`${mode}\``);
    }