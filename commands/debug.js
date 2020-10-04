module.exports = {
    name: "debug",
    aliases: ["d"],
    run: async (client, message, args) => {
        if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`)
        try {
            let queue = client.distube.getQueue(message);
            console.log("```" + queue.songs + "```");
        } catch (e) {
            message.channel.send(`${client.emotes.error} | Error: \`${e}\``)
        }
    }
}