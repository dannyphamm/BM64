// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, IntentsBitField } = require('discord.js');
const { token } = require('./config.json');
const { YtDlpPlugin } = require("@distube/yt-dlp")
const { DisTube } = require("distube");
const { SpotifyPlugin } = require('@distube/spotify');
const { log, error } = require("./utils/utils");
const Genius = require("genius-lyrics");
const GeniusClient = new Genius.Client();
const MongoConnection = require('./utils/db');
// Create a new client instance
const myIntents = new IntentsBitField();
myIntents.add(IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.GuildVoiceStates, IntentsBitField.Flags.MessageContent);
const client = new Client(
    {
        intents: myIntents
    });

const connectToDB = async () => {
    await MongoConnection.connect();
    client.mongodb = MongoConnection;
}
connectToDB()
client.commands = new Collection();
const eventPath = path.resolve(__dirname, 'events');

fs.readdir(eventPath, (err, files) => {
    if (err) throw err;
    files.filter(file => file.endsWith('.js')).forEach(file => {
        const filePath = path.join(eventPath, file);
        const event = require(filePath);
        log(`Loaded Event: ${event.name}`)
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    });
});

const commandsPath = path.join(__dirname, 'commands');

const loadCommands = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.lstatSync(filePath);

        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            log(`Loaded Command: ${command.data.name}`)
            client.commands.set(command.data.name, command);
        }
    }
};

loadCommands(commandsPath);

const distube = new DisTube(client, {
    plugins: [
        new YtDlpPlugin({ update: false }),
        new SpotifyPlugin({
            emitEventsAfterFetching: true
        })
    ],
    ytdlOptions: {
        filter: 'audioonly',
        quality: 'highestaudio',
    }
})
distube.on('error', (channel, e) => {
    if (channel) channel.send(`An error encountered: ${e}`)
    else error(e, "DISTUBE_ERROR")
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

client.genius = GeniusClient;
client.distube = distube;


// Login to Discord with your client's token
client.login(token);
