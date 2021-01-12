exports.run = (client, message, args) => {
    const voiceChannelID = message.member.voice.channelID;
    const channel = message.guild.channels.cache.find((channel) => channel.name === 'the-agency');
   if(voiceChannelID === "444750383588573184" && message.channel.id === channel.id) {
        message.mentions.members.each(user => {
            channel.updateOverwrite(user.id,
                {
                  VIEW_CHANNEL: true,
                });
          });
    }
  };
  