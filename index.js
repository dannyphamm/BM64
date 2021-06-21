const DisTube = require("distube")
const Discord = require("discord.js")
const client = new Discord.Client()
const config = require("./config.json")
const SpotifyPlugin = require("@distube/spotify")
const SoundCloudPlugin = require("@distube/soundcloud")
const fs = require("fs")



client.config = require("./config.json")
client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    plugins: [new SpotifyPlugin(),new SoundCloudPlugin()]
})

require('./handlers/eventsHandler')(client);
require('./handlers/commandHandler')(client);
client.commands = new Discord.Collection()
client.aliases = new Discord.Collection()
client.emotes = config.emoji
// client.distube.on('initQueue', (queue) => {
//   queue.autoplay = false;
// });


const status = queue => `Volume: \`${queue.volume}%\` | Filter: \`${queue.filters.join(", ") || "Off"}\` | Loop: \`${queue.repeatMode ? queue.repeatMode === 2 ? "All Queue" : "This Song" : "Off"}\` | Autoplay: \`${queue.autoplay ? "On" : "Off"}\``
client.distube
  .on("playSong", (queue, song) => queue.textChannel.send(
    `${client.emotes.play} | Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user}\n${status(queue)}`
  ))
  .on("addSong", (queue, song) => queue.textChannel.send(
    `${client.emotes.success} | Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`
  ))
  .on("addList", (queue, playlist) => queue.textChannel.send(
    `${client.emotes.success} | Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to queue\n${status(queue)}`
  ))
  // DisTubeOptions.searchSongs = true
  .on("searchResult", (message, result) => {
    let i = 0
    message.channel.send(`**Choose an option from below**\n${result.map(song => `**${++i}**. ${song.name} - \`${song.formattedDuration}\``).join("\n")}\n*Enter anything else or wait 60 seconds to cancel*`)
  })
  // DisTubeOptions.searchSongs = true
  .on("searchCancel", message => message.channel.send(`${client.emotes.error} | Searching canceled`))
  .on("error", (channel, e) => {
    channel.send(`${client.emotes.error} | An error encountered: ${e}`)
    console.error(e)
  })
  .on("empty", channel => channel.send("Voice channel is empty! Leaving the channel..."))
  .on("searchNoResult", message => message.channel.send(`${client.emotes.error} | No result found!`))
  .on("finish", queue => queue.textChannel.send("Finished!"))
client.login(config.token);

