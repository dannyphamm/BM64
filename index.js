const Discord = require(`discord.js`);
require('dotenv').config();

const client = new Discord.Client();


var catergoryID = process.env.CATERGORYID;
var channelID = process.env.CHANNELID;
var token = process.env.TOKEN
client.once('ready', () => {
    console.log('BM64 is Online1');
})


client.on('voiceStateUpdate', (oldMember, newMember) => {
    const newUserChannel = newMember.channelID
    const oldUserChannel = oldMember.channelID
    //const textChannel = message.guild.channels.cache.get('712677731023716452')

    if (newUserChannel === channelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        if (channel == undefined || channel == null) {
            console.log("Creating text channel");
            newMember.guild.channels.create("The-Agency", {
                type: 'text',
                permissionOverwrites: [
                    {
                        id: newMember.guild.id,
                        deny: ['VIEW_CHANNEL'],
                    }
                ]
            }).then(channel => {
                channel.setTopic('This is a temporary text channel and will be removed when "The Agency" is empty');
                channel.setParent(catergoryID);
            })
        } else {
            channel.updateOverwrite(newMember.id, {
                VIEW_CHANNEL: true,

            }

            )
        }
        console.log("JOIN" + newMember.id);

    } else if (oldUserChannel === channelID && newUserChannel !== channelID) {
        const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
        const channelBots = newMember.guild.members.cache.filter(member => !member.user.bot).size;
        console.log(channel.members.size - channelBots)
        channel.updateOverwrite(newMember.id, {
            VIEW_CHANNEL: false,
        })
        console.log("running final check");
        setTimeout(function () {
            finalChannelCheck(newMember);
        }, 5000);
        console.log("LEAVE" + newMember.id);
    }
})

function finalChannelCheck(newMember) {
    const channel = newMember.guild.channels.cache.find(channel => channel.name === "the-agency");
    const channelBots = newMember.guild.members.cache.filter(member => !member.user.bot).size;
    try {
        if (channel.members.size - channelBots <= 0) {
            channel.delete();
            console.log("Final Check - Deleting text channel");
        }
    } catch (error) {
        console.log("Error");
    }
}

client.login(token);