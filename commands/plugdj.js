const PlugAPI = require('plugapi');
let active = false;
exports.run = (client, message, args) => {
  /**
* Check if in queue already.
* @param {message} media data
* @return {boolean} returns boolean.
*/
  function checkExists(media) {
    const queue = client.distube.getQueue(message);
    console.log(queue);
    // If the queue is not empty
    if (queue) {
      console.log('Queue Exists 2');
      // return boolean if found song or not
      console.log(queue.songs.some((song) => song.id == media.cid));
      // If exists, return true else false
      return queue.songs.some((song) => song.id == media.cid);
    }

    if (!queue) {
      console.log('Empty Queue 1');
      // if the queue is empty
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
      console.log('YouTube detected');
      return `https://youtu.be/${media.cid}`;
    } else {
      console.log('Soundcloud detected');
      return `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${media.cid}`;
    }
  }

  try {
    if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
    message.channel.send(`Attempting to join PlugDJ room. Standby`);
    if (!active) {
      active = true;
      client.bot.connect(args[0]);
      client.bot.on(PlugAPI.events.ADVANCE, (data) => {
        const media = data.media;
        if (!checkExists(media)) {
          console.log('Adding to Queue');
          client.distube.play(message, parseURL(media));
        }
      });
      client.bot.on(PlugAPI.events.ROOM_JOIN, (room) => {
        console.log(`Joined ${room}`);
        message.channel.send(`Joined ${room}`);
      });
      client.bot.on(PlugAPI.events.ROOM_CHANGE, (room) => {
        console.log(`Change ${room}`);
        message.channel.send(`Change ${room}`);
      });
    } else {
      client.bot.changeRoom(args[0]);
    }
  } catch (e) {
    message.channel.send(`${client.emotes.error} | Error: \`${e}\``);
  }
};

