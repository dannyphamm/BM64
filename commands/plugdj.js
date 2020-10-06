const PlugAPI = require('plugapi');

exports.run = (client, message, args) => {
  let checkForNewSong;

  /**
 * Stops the repeater
 */
  function stop() {
    // console.log(time + "left");
    clearInterval(checkForNewSong);
  }
  /**
 * Check if in queue already.
 * @param {message} message Discord.JS message.
 * @return {boolean} returns boolean.
 */
  function checkExists(message) {
    try {
      const queue = client.distube.getQueue(message);
      return queue.songs.some((song) => song.id == client.bot.getMedia().cid);
    } catch (error) {
      console.log(error);
      return true;
    }
  }
  /**
 * Get url from provider.
 * @return {string} returns string.
 */
  function parseURL() {
    if (isNaN(client.bot.getMedia().cid)) {
      console.log('YouTube detected');
      return `https://youtu.be/${client.bot.getMedia().cid}`;
    } else {
      console.log('Soundcloud detected');
      return `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${client.bot.getMedia().cid}`;
    }
  }
  // Checks if song ID is queue and return boolean
  try {
    if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
    message.channel.send(`Attempting to join PlugDJ room. Standby`);
    client.bot.connect(args[0]);
    client.bot.on(PlugAPI.events.ROOM_JOIN, (room) => {
      console.log(`Joined ${room}`);
      message.channel.send(`Joined ${room}`);
      client.distube.play(message, parseURL());
      checkForNewSong = setInterval(() => {
        if (!message.member.voice.channel) {
          stop();
        } else {
          if (!checkExists(message)) {
            console.log('Adding song to Queue');
            // console.log(time + 'Adding song to Queue');
            client.distube.play(message, parseURL());
          } else {
            // console.log(time + "exists")
          }
        }
        // If Song is not in queue then add
      }, 10000);
    });
  } catch (e) {
    message.channel.send(`${client.emotes.error} | Error: \`${e}\``);
  }
};
