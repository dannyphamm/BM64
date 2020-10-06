const Discord = require('discord.js');
const DisTube = require('distube');
const Enmap = require('enmap');
const client = new Discord.Client();
const PlugAPI = require('plugapi');
config = require('./config.json');
client.config = config;

if (config.token == '') {
  console.log('No token provided');
  process.exit();
} else {
  client.commands = new Enmap();
  client.aliases = new Discord.Collection();
  client.emotes = config.emoji;
  require('./handlers/eventsHandler')(client);
  require('./handlers/commandHandler')(client);

  client.distube = new DisTube(client, {
    searchSongs: false,
    emitNewSongOnly: false,
    highWaterMark: 1 << 25,
    youtubeCookie: config.ytCookie,
    youtubeIdentityToken: config.ytIDToken,
  });

  client.bot = new PlugAPI({
    guest: true,
  });

  client.distube.on('initQueue', (queue) => {
    queue.autoplay = false;
  });
  const status = (queue) => `Volume: \`${queue.volume}%\` | Filter: \`${queue.filter || 'Off'}\` | Loop: \`${queue.repeatMode ? queue.repeatMode == 2 ? 'All Queue' : 'This Song' : 'Off'}\` | Autoplay: \`${queue.autoplay ? 'On' : 'Off'}\``;

  // DisTube event listeners, more in the documentation page
  client.distube
      .on('playSong', (message, queue, song) => message.channel.send(
          `Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user.username}\n${status(queue)}`,
      ))
      .on('addSong', (message, queue, song) => message.channel.send(`Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user.username}`,
      ))
      .on('playList', (message, queue, playlist, song) => message.channel.send(`Play \`${playlist.title}\` playlist (${playlist.total_items} songs).\nRequested by: ${song.user.username}\nNow playing \`${song.name}\` - \`${song.formattedDuration}\`\n${status(queue)}`,
      ))
      .on('addList', (message, queue, playlist) => message.channel.send(`Added \`${playlist.title}\` playlist (${playlist.total_items} songs) to queue\n${status(queue)}`,
      ))
  // DisTubeOptions.searchSongs = true
      .on('searchResult', (message, result) => {
        let i = 0;
        message.channel.send(`**Choose an option from below**\n${result.map((song) => `**${++i}**. ${song.name} - \`${song.formattedDuration}\``).join('\n')}\n*Enter anything else or wait 60 seconds to cancel*`);
      })
  // DisTubeOptions.searchSongs = true
      .on('searchCancel', (message) => message.channel.send(`Searching canceled`))
      .on('error', (message, err) => message.channel.send('An error encountered: ' + err));
  client.login(config.token);
}

