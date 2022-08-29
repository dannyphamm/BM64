// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Intents } = require('discord.js');
const { token } = require('./config.json');
const { YtDlpPlugin } = require("@distube/yt-dlp")
const DisTube = require("distube");
const { GatewayIntentBits } = require('discord-api-types/v10');
const { SpotifyPlugin } = require('@distube/spotify');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });


client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const eventsPath = path.join(__dirname, 'events');
const servicesPath = path.join(__dirname, 'services');

const events = [eventsPath, servicesPath]

for (const eventPath of events) {
    const files = fs.readdirSync(eventPath).filter(file => file.endsWith('.js'));
    for (const file of files) {
        const filePath = path.join(eventPath, file);
        const event = require(filePath);
        console.log("Loaded Event:", event.name)
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    console.log("Loaded Command:", command.data.name)
    client.commands.set(command.data.name, command);
}

const distube = new DisTube.DisTube(client, {
    youtubeDL: false, plugins: [
        new YtDlpPlugin(),
        new SpotifyPlugin({
            emitEventsAfterFetching: true
        })]
})
distube.on('error', (channel, e) => {
    if (channel) channel.send(`An error encountered: ${e}`)
    else console.error(e)
})
distube.on("initQueue", queue => {
    queue.autoplay = false;
    queue.volume = 100;
    queue.voice.setSelfDeaf(false)
});
distube.on("empty", queue => {
    queue.voice.setSelfDeaf(true)
})
distube.on("finish", queue => {
    queue.voice.setSelfDeaf(true)
})
distube.on("addSong", (queue, song) => queue.textChannel.send(
    `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}.`
));
distube.on("playSong", (queue, song) => queue.textChannel.send(
    `Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user}`
));

client.distube = distube;
// Login to Discord with your client's token
client.login(token);
