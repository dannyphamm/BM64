const Discord = require(`discord.js`);

require('dotenv').config();

const client = new Discord.Client();

var catergoryID = process.env.CATERGORYID;
var channelID = process.env.CHANNELID;
var token = process.env.TOKEN

client.once('ready', () => {
    console.log('BM64 is Online');
})


client.on('voiceStateUpdate', (oldMember, newMember) => {
    const newUserChannel = newMember.channelID
    const oldUserChannel = oldMember.channelID
    if (oldUserChannel !== channelID && newUserChannel === channelID) {
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
                channel.setParent(catergoryID, { lockPermissions: false });
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

    } else if (oldUserChannel === channelID && newUserChannel !== channelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        try {
            //Remove user from text channel
            channel.updateOverwrite(newMember.id, {
                VIEW_CHANNEL: false,
            });
            console.log("Running Final Fheck");

            const vChannel = newMember.guild.channels.cache.find(channel => channel.id === channelID);
            const channelBots = vChannel.members.size;
            console.log(channelBots);
            if (channelBots <= 0) {
                console.log("Deleting text Channel countdown started");
                setTimeout(function () {
                    const vChannel = newMember.guild.channels.cache.find(channel => channel.id === channelID);
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


client.login(token);