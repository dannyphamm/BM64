const PlugAPI = require('plugapi');
loadListeners = false;
exports.run = (client, message, args) => {
  /**
* Check if in queue already.
* @param {message} media data
* @return {boolean} returns boolean.
*/
  function checkExists(media) {
    const queue = client.distube.getQueue(message);
    if (queue) {
      return queue.songs.some((song) => song.id == media.cid);
    }

    if (!queue) {
      client.distube.play(message, parseURL(media));
      return true;
    }
  }
  /**
* Check if in queue already.
* @param {media} media data.
* @return {string} returns url.
*/
  function parseURL(media) {
    if (media.format == 1) {
      return `https://youtu.be/${media.cid}`;
    } else {
      return `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${media.cid}`;
    }
  }

  if (!loadListeners) {
    client.bot.on(PlugAPI.events.ADVANCE, (data) => {
      const media = data.media;
      console.log(media);
      if (!checkExists(media)) {
        console.log('Adding to Queue');
        client.distube.play(message, parseURL(media));
      }
    });
    client.bot.on(PlugAPI.events.ROOM_JOIN, (room) => {
      console.log(`Joined ${room}`);
      message.channel.send(`Joined ${room}`);
    });
    loadListeners = true;
  }


  try {
    if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
    message.channel.send(`Attempting to join PlugDJ room. Standby`);
    try {
      client.bot.close(false);
    } catch (e) {
      console.log(e);
    }
    console.log('connecting');
    client.bot.connect(args[0]);

    console.log(global.active);
  } catch (e) {
    message.channel.send(`${client.emotes.error} | Error: \`${e}\``);
    loadListeners = false;
  }
};

