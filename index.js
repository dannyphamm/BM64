const Discord = require('discord.js');
const DisTube = require('distube');
const fs = require("fs");
const plugdj = require('./commands/plugdj');
const config = require("./config.json")

const client = new Discord.Client();

client.config = require("./config.json")
client.commands = new Discord.Collection()
client.aliases = new Discord.Collection()
client.emotes = config.emoji;

client.distube = new DisTube(client, { 
    searchSongs: false, 
    emitNewSongOnly: false, 
    highWaterMark: 1 << 25, 
    youtubeCookie: "VISITOR_INFO1_LIVE=OA0X4cRu3cg; HSID=AezDZckonnjRvl-Ql; SSID=AF5uji9cM43LyYRwC; APISID=-whiJ7Z2waIZU6U-/AXViIN5zfolN9MX34; SAPISID=Q6fgMLbgV6j68a3I/AdDuwY_BeiQ9BA0xx; __Secure-3PAPISID=Q6fgMLbgV6j68a3I/AdDuwY_BeiQ9BA0xx; LOGIN_INFO=AFmmF2swRgIhAIH6xkm3_kmZ9QRpTJN5JqrIfuohcYqqxSYaH52RdxyTAiEA46hoo4grrHaaq0OJs4D5OhfLRQr3n4e5Ls77pKG7znI:QUQ3MjNmd1RYM2JIZGFIU2dyVjFmYkVUMjVnd0o3NnhsdXZDdFBoSWMwNno4OVVGaVNXVzlLaWRRNHlSeUdyUGptbkl0THQzYWdjaDQyenJnUVdBU3Y3WnNHNTBWNXdIRUh1TkRxQ1gzNFdoY1I5MFN1TGRFdGw4bVhTQkk3SGRQZG9mVndyUXVQVU5iMWFXbWlhRTR0ZTNCaUdKUjNYUi1aMzJFVlNlZXNNcXkyS0Z3VGNzNVB2SENBcUw2TmxiVnZNZV9BV3ZGLWpEdGN6S2h4TENVYVd0ckEtdk91Z0lIanNOZFpmcDJuZVpDd3dJSGEtY0loN3dzRi1la3UyTUhuRU1TZ2VVZmJJZg==; PREF=f6=400&al=en-GB; YSC=my6PNdln6F8; wide=0; SID=1gcFnbslHCVUVV72C9TG-VzVrvCbkCY2qbS4FaSOnhlnmU5K7ZpNm6Th-ivDphp4kncGRA.; __Secure-3PSID=1gcFnbslHCVUVV72C9TG-VzVrvCbkCY2qbS4FaSOnhlnmU5KlmyS1W2dW_I6jwe9-cUFtA.; SIDCC=AJi4QfEFpinlmJb8XKiF9RkPCRjZVrenvQ2izXdtIuLxc7LCtT_MiMsZP4hkpPBjf3XN1pH9005-; __Secure-3PSIDCC=AJi4QfEeRrgOPuYmpVVUlU6mb07DSTzMIQPsQcwT6YkmbaeXLTCfoLo3nf_OuMuCcytP_U0X_8Gl", 
    youtubeIdentityToken: 'QUFFLUhqbEVmbTVvcmJKb0FfdHR0cm5jVlVkYTI1ZS1HZ3w='
});

client.distube.on("initQueue", queue => {
    queue.autoplay = false;
});

client.on('ready', () => {
    console.log('BM64 is Online');
});

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
                    });
            })
        } else {
            channel.updateOverwrite(newMember.id,
                {
                    VIEW_CHANNEL: true,
                })
        }

    } else if (oldUserChannel === config.voiceChannelID && newUserChannel !== config.voiceChannelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        try {
            //Remove user from text channel
            channel.updateOverwrite(newMember.id, {
                VIEW_CHANNEL: false,
            });
            //console.log("Running Final Fheck");

            const vChannel = newMember.guild.channels.cache.find(channel => channel.id === config.voiceChannelID);
            if (vChannel.members.size <= 0) {
                //console.log("Deleting text Channel countdown started");
                setTimeout(function () {
                    const vChannel = newMember.guild.channels.cache.find(channel => channel.id === config.voiceChannelID);
                    if (vChannel.members.size <= 0) {
                        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
                        channel.delete();
                        //console.log("Deleting text channel");
                    }
                }, 3600000);
            }
            //console.log("LEAVE" + newMember.id);
        } catch (error) {
            console.log(error);
        }
    }
})



fs.readdir("./commands/", (err, files) => {
    let jsFiles = files.filter(f => f.split(".").pop() === "js")
    if (jsFiles.length <= 0) return console.log("Could not find any commands!")
    jsFiles.forEach((file) => {
        let cmd = require(`./commands/${file}`)
        console.log(`Loaded ${file}`)
        client.commands.set(cmd.name, cmd)
        if (cmd.aliases) cmd.aliases.forEach(alias => client.aliases.set(alias, cmd.name))
    })
})

client.on('message', async message => {
    let prefix = config.prefix
    if (!message.content.startsWith(prefix)) return
    const args = message.content.slice(prefix.length).trim().split(/ +/g)
    const command = args.shift().toLowerCase();
    let cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command))
    if (!cmd) return
    try {
        cmd.run(client, message, args)
    }
    catch (e) {
        console.error(e)
        message.reply("Error: " + e)
    }

})


// Queue status template
const status = (queue) => `Volume: \`${queue.volume}%\` | Filter: \`${queue.filter || "Off"}\` | Loop: \`${queue.repeatMode ? queue.repeatMode == 2 ? "All Queue" : "This Song" : "Off"}\` | Autoplay: \`${queue.autoplay ? "On" : "Off"}\``;

// DisTube event listeners, more in the documentation page
client.distube
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