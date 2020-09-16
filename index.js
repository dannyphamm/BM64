const Discord = require(`discord.js`);
const DisTube = require('distube');
const PlugAPI = require('plugapi');
require('dotenv').config();

const client = new Discord.Client();
config = {
    prefix: ".",
    token: process.env.TOKEN,
    catergoryID: process.env.catergoryID,
    voiceChannelID: process.env.VOICECHANNELID
};

const distube = new DisTube(client, { searchSongs: false, emitNewSongOnly: false, highWaterMark: 1 << 25 });

client.once('ready', () => {
    console.log('BM64 is Online');
})

client.on('voiceStateUpdate', (oldMember, newMember) => {
    const newUserChannel = newMember.channelID
    const oldUserChannel = oldMember.channelID
    if (oldUserChannel !== config.voiceChannelID && newUserChannel === config.voiceChannelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        if (channel == undefined || channel == null) {
            console.log("Creating text channel");
            newMember.guild.channels.create("the-agency", {
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
                ]
            }).then(channel => {
                channel.setTopic('This is a temporary text channel and will be removed when "The Agency" is empty');
                channel.setParent(config.catergoryID, { lockPermissions: false });
                channel.send("Please use `-` to play music.");
                channel.updateOverwrite(newMember.id,
                    {
                        VIEW_CHANNEL: true,
                    })
            })
        } else {

            channel.updateOverwrite(newMember.id,
                {
                    VIEW_CHANNEL: true,
                })
        }

        console.log("JOIN" + newMember.id);

    } else if (oldUserChannel === config.voiceChannelID && newUserChannel !== config.voiceChannelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        try {
            //Remove user from text channel
            channel.updateOverwrite(newMember.id, {
                VIEW_CHANNEL: false,
            });
            console.log("Running Final Fheck");

            const vChannel = newMember.guild.channels.cache.find(channel => channel.id === config.voiceChannelID);
            const channelBots = vChannel.members.size;
            console.log(channelBots);
            if (channelBots <= 0) {
                console.log("Deleting text Channel countdown started");
                setTimeout(function () {
                    const vChannel = newMember.guild.channels.cache.find(channel => channel.id === config.voiceChannelID);
                    const channelBots = vChannel.members.size;
                    if (channelBots <= 0) {
                        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
                        channel.delete();
                        console.log("Deleting text channel");
                    } else {
                        console.log("Aborted")
                    }
                }, 3600000);
            }
            console.log("LEAVE" + newMember.id);
        } catch (error) {
            console.log(error);
        }

    }
})

function checkExists(message, bot) {
    let queue = distube.getQueue(message);
    return queue.songs.some(song => song.id == bot.getMedia().cid);
}

client.on("message", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;
    const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
    const command = args.shift();
    var channel = message.member.voice.channel;
    if (command == "join") {
        if (!message.member.voice.connection) {
            channel.join();
        }
    }

    if (command == "plugdj") {
        bot = new PlugAPI({
            guest: true
        }, (err, bot) => {
            if (!err) {
                message.channel.send(`Attempting to join PlugDJ room. Standby`);
                bot.connect(args[0]); // The part after https://plug.dj
                bot.on(PlugAPI.events.ROOM_JOIN, (room) => {
                    console.log(`Joined ${room}`);
                    message.channel.send(`Joined ${room}`);
                    distube.play(message, "https://youtu.be/" + bot.getMedia().cid);

                    setInterval(() => {
                        if(!message.member.voice.connection){
                            clearInterval();
                        } else{
                            if (!checkExists(message, bot)) {
                                console.log("Adding song to Queue");
                                distube.play(message, "https://youtu.be/" + bot.getMedia().cid);
                            } else {
                                console.log("Exists in queue");
                            }
                        }
                    }, 15000);
                });
            } else {
                console.log(`Error initializing plugAPI: ${err}`);
                message.channel.send(`Could not join ${room}`);
            }
        });
    }

    if (command == "debug") {
        let queue = distube.getQueue(message);
        console.log(queue.songs)
    }


    if (command == "play")
        distube.play(message, args.join(" "));

    if (["repeat", "loop"].includes(command))
        distube.setRepeatMode(message, parseInt(args[0]));

    if (command == "stop") {
        distube.stop(message);
        message.channel.send("Stopped the music!");
    }

    if (command == "skip") {
        distube.skip(message);
        message.channel.send("Skipping music!");
    }

    if (command == "queue") {
        let queue = distube.getQueue(message);
        message.channel.send('Current queue:\n' + queue.songs.map((song, id) =>
            `**${id + 1}**. ${song.name} - \`${song.formattedDuration}\``
        ).join("\n"));
    }

    if ([`3d`, `bassboost`, `echo`, `karaoke`, `nightcore`, `vaporwave`].includes(command)) {
        let filter = distube.setFilter(message, command);
        message.channel.send("Current queue filter: " + (filter || "Off"));
    }

    if (command == "autoplay") {
        let mode = distube.toggleAutoplay(message);
        message.channel.send("Set autoplay mode to `" + (mode ? "On" : "Off") + "`");
    }
});

// Queue status template
const status = (queue) => `Volume: \`${queue.volume}%\` | Filter: \`${queue.filter || "Off"}\` | Loop: \`${queue.repeatMode ? queue.repeatMode == 2 ? "All Queue" : "This Song" : "Off"}\` | Autoplay: \`${queue.autoplay ? "On" : "Off"}\``;

// DisTube event listeners, more in the documentation page
distube
    .on("playSong", (message, queue, song) => message.channel.send(
        `Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user.username}\n${status(queue)}`
    ))
    .on("addSong", (message, queue, song) => message.channel.send(
        `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user.username}`
    ))
    .on("playList", (message, queue, playlist, song) => message.channel.send(
        `Play \`${playlist.title}\` playlist (${playlist.total_items} songs).\nRequested by: ${song.user.username}\nNow playing \`${song.name}\` - \`${song.formattedDuration}\`\n${status(queue)}`
    ))
    .on("addList", (message, queue, playlist) => message.channel.send(
        `Added \`${playlist.title}\` playlist (${playlist.total_items} songs) to queue\n${status(queue)}`
    ))
    // DisTubeOptions.searchSongs = true
    .on("searchResult", (message, result) => {
        let i = 0;
        message.channel.send(`**Choose an option from below**\n${result.map(song => `**${++i}**. ${song.name} - \`${song.formattedDuration}\``).join("\n")}\n*Enter anything else or wait 60 seconds to cancel*`);
    })
    // DisTubeOptions.searchSongs = true
    .on("searchCancel", (message) => message.channel.send(`Searching canceled`))
    .on("error", (message, err) => message.channel.send(
        "An error encountered: " + err
    ));

client.login(config.token);