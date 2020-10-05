const PlugAPI = require('plugapi');
exports.run = (client, message, args) => {
    const bot = new PlugAPI({
        guest: true
    });
    // Checks if song ID is queue and return boolean
    function checkExists(message) {
        try {
            let queue = client.distube.getQueue(message);
            return queue.songs.some(song => song.id == bot.getMedia().cid);
        } catch (error) {
            console.log(error);
            return true;
        }
    }

    // Parse URL and return url and provider as an array.
    function parseURL() {
        if (isNaN(bot.getMedia().cid)) {
            console.log("YouTube detected");
            return `https://youtu.be/${bot.getMedia().cid}`;
        } else {
            console.log("Soundcloud detected")
            return `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${bot.getMedia().cid}`;
        }

    }
    try {
        if (!message.member.voice.channel) return message.channel.send(`${client.emotes.error} | You must be in a voice channel!`);
        message.channel.send(`Attempting to join PlugDJ room. Standby`);
        bot.connect(args[0]);
        bot.on(PlugAPI.events.ROOM_JOIN, (room) => {
            console.log(`Joined ${room}`);
            message.channel.send(`Joined ${room}`);
            client.distube.play(message, parseURL());
            setInterval(() => {
                if (!message.member.voice.connection) {
                    clearInterval();
                }
                // If Song is not in queue then add
                if (!checkExists(message)) {
                    console.log("Adding song to Queue");
                    client.distube.play(message, parseURL());
                }
            }, 5000);
        });
    } catch (e) {
        message.channel.send(`${client.emotes.error} | Error: \`${e}\``)
    }
}

