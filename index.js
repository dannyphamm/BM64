const Discord = require('discord.js');
const DisTube = require('distube');
const fs = require('fs');
const config = require('./config.json');

const client = new Discord.Client();

client.config = require('./config.json');
client.commands = new Discord.Collection();
client.aliases = new Discord.Collection();
client.emotes = config.emoji;

client.distube = new DisTube(client, {
  searchSongs: false,
  emitNewSongOnly: false,
  highWaterMark: 1 << 25,
  youtubeCookie: config.ytCookie,
  youtubeIdentityToken: config.ytIDToken,
});

client.distube.on('initQueue', (queue) => {
  queue.autoplay = false;
});

client.on('ready', () => {
  console.log('BM64 is Online');
});

client.on('voiceStateUpdate', (oldMember, newMember) => {
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
        channel.setParent(config.catergoryID, {lockPermissions: false});
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
        setTimeout(function() {
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
});


fs.readdir('./commands/', (err, files) => {
  const jsFiles = files.filter((f) => f.split('.').pop() === 'js');
  if (jsFiles.length <= 0) return console.log('Could not find any commands!');
  jsFiles.forEach((file) => {
    const cmd = require(`./commands/${file}`);
    console.log(`Loaded ${file}`);
    client.commands.set(cmd.name, cmd);
    if (cmd.aliases) cmd.aliases.forEach((alias) => client.aliases.set(alias, cmd.name));
  });
});

client.on('message', async (message) => {
  const prefix = config.prefix;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();
  const cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command));
  if (!cmd) return;
  try {
    cmd.run(client, message, args);
  } catch (e) {
    console.error(e);
    message.reply('Error: ' + e);
  }
});


// Queue status template
const status = (queue) => `Volume: \`${queue.volume}%\` | Filter: \`${queue.filter || 'Off'}\` | 
Loop: \`${queue.repeatMode ? queue.repeatMode == 2 ? 'All Queue' : 'This Song' : 'Off'}\` | 
Autoplay: \`${queue.autoplay ? 'On' : 'Off'}\``;

// DisTube event listeners, more in the documentation page
client.distube
    .on('playSong', (message, queue, song) => message.channel.send(
        `Playing \`${song.name}\` - \`${song.formattedDuration}\`
        \nRequested by: ${song.user.username}\n${status(queue)}`,
    ))
    .on('addSong', (message, queue, song) => message.channel.send(
        `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user.username}`,
    ))
    .on('playList', (message, queue, playlist, song) => message.channel.send(
        `Play \`${playlist.title}\` playlist (${playlist.total_items} songs).\nRequested by: ${song.user.username}
        \nNow playing \`${song.name}\` - \`${song.formattedDuration}\`\n${status(queue)}`,
    ))
    .on('addList', (message, queue, playlist) => message.channel.send(
        `Added \`${playlist.title}\` playlist (${playlist.total_items} songs) to queue\n${status(queue)}`,
    ))
    // DisTubeOptions.searchSongs = true
    .on('searchResult', (message, result) => {
      let i = 0;
      message.channel.send(`**Choose an option from below**\n${result.map((song) =>
        `**${++i}**. ${song.name} - \`${song.formattedDuration}\``).join('\n')}
        \n*Enter anything else or wait 60 seconds to cancel*`);
    })
    // DisTubeOptions.searchSongs = true
    .on('searchCancel', (message) => message.channel.send(`Searching canceled`))
    .on('error', (message, err) => message.channel.send(
        'An error encountered: ' + err,
    ));

client.login(config.token);
