const config = require("../config.json");

module.exports = (client, oldMember, newMember) => {
  const newUserChannel = newMember.channelID;
  const oldUserChannel = oldMember.channelID;
  if (oldUserChannel !== config.voiceChannelID && newUserChannel === config.voiceChannelID) {
    const channel = newMember.guild.channels.cache.find((channel) => channel.name === 'the-agency');
    if (channel == undefined || channel == null) {
      console.log('Creating text channel');
      newMember.guild.channels.create('the-agency', {
        type: 'text',
        permissionOverwrites: [
          {
            id: newMember.guild.id,
            deny: ['VIEW_CHANNEL'],
          },
          {
            id: '184405311681986560',
            allow: ['VIEW_CHANNEL', 'ADD_REACTIONS', 'SEND_MESSAGES'],
          },
        ],
      }).then((channel) => {
        channel.setTopic('This is a temporary text channel and will be removed when "The Agency" is empty');
        channel.setParent(config.catergoryID, { lockPermissions: false });
        channel.send('Please use `-` to play music.');
        channel.updateOverwrite(newMember.id,
          {
            VIEW_CHANNEL: true,
          });
      });
    } else {
      channel.updateOverwrite(newMember.id,
        {
          VIEW_CHANNEL: true,
        });
    }
  } else if (oldUserChannel === config.voiceChannelID && newUserChannel !== config.voiceChannelID) {
    const channel = newMember.guild.channels.cache.find((channel) => channel.name === 'the-agency');
    try {
      // Remove user from text channel
      channel.updateOverwrite(newMember.id, {
        VIEW_CHANNEL: false,
      });
      // console.log("Running Final Fheck");

      const vChannel = newMember.guild.channels.cache.find((channel) => channel.id === config.voiceChannelID);
      if (vChannel.members.size <= 0) {
        // console.log("Deleting text Channel countdown started");
        setTimeout(function () {
          const vChannel = newMember.guild.channels.cache.find((channel) => channel.id === config.voiceChannelID);
          if (vChannel.members.size <= 0) {
            const channel = newMember.guild.channels.cache.find((channel) => channel.name === 'the-agency');
            channel.delete();
            // console.log("Deleting text channel");
          }
        }, 3600000);
      }
      // console.log("LEAVE" + newMember.id);
    } catch (error) {
      console.log(error);
    }
  }
}