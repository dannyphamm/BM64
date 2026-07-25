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
myIntents.add(IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.GuildVoiceStates, IntentsBitField.Flags.MessageContent,IntentsBitField.Flags.GuildPresences);
const client = new Client(
    {
        intents: myIntents
    });

// Make client available globally for scheduled tasks
global.discordClient = client;

// Discord.js enables captureRejections — async event handler rejections become Client 'error'.
// Without a listener, Node crashes with: Emitted 'error' event on Client instance.
client.on('error', (err) => {
    error('Discord client error:', err);
});

const connectToDB = async () => {
    try {
        await MongoConnection.connect();
        client.mongodb = MongoConnection;
        log('✅ Database connected successfully');
    } catch (error) {
        error('❌ Database connection failed:', error);
        process.exit(1);
    }
};
connectToDB();
client.commands = new Collection();
const eventPath = path.resolve(__dirname, 'events');

const loadEvents = async () => {
    try {
        const files = await fs.promises.readdir(eventPath);
        files.filter(file => file.endsWith('.js')).forEach(file => {
            const filePath = path.join(eventPath, file);
            const event = require(filePath);
            log(`Loaded Event: ${event.name}`);
            const run = (...args) =>
                Promise.resolve(event.execute(...args)).catch((err) => {
                    error(`Unhandled error in event ${event.name}:`, err);
                });
            if (event.once) {
                client.once(event.name, run);
            } else {
                client.on(event.name, run);
            }
        });
    } catch (err) {
        error('Error loading events:', err);
        throw err;
    }
};

loadEvents();

const commandsPath = path.join(__dirname, 'commands');

const loadCommands = async (dir) => {
    try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const file of files) {
            const filePath = path.join(dir, file.name);

            if (file.isDirectory()) {
                await loadCommands(filePath);
            } else if (file.name.endsWith('.js')) {
                try {
                    const command = require(filePath);
                    if (command.data && command.data.name) {
                        log(`Loaded Command: ${command.data.name}`);
                        client.commands.set(command.data.name, command);
                    } else {
                        error(`Command at ${filePath} is missing required 'data.name' property`);
                    }
                } catch (err) {
                    error(`Error loading command ${file.name}:`, err);
                }
            }
        }
    } catch (err) {
        error('Error reading commands directory:', err);
        throw err;
    }
};

// Load commands asynchronously
loadCommands(commandsPath).catch(err => {
    error('Failed to load commands:', err);
    process.exit(1);
});

const distube = new DisTube(client, {
    plugins: [
        
        new SpotifyPlugin({
            //emitEventsAfterFetching: true
        }),
        new YtDlpPlugin({ update: false }),
    ],
    // ytdlOptions: {
    //     filter: 'audioonly',
    //     quality: 'highestaudio',
    // }
})
distube.on('error', (channel, e) => {
    if (channel) channel.send(`An error encountered: ${e}`).catch(() => {});
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
distube.on("addSong", (queue, song) => queue.textChannel?.send(
    `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}.`
).catch(() => {}));
distube.on("playSong", (queue, song) => queue.textChannel?.send(
    `Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user}`
).catch(() => {}));

client.genius = GeniusClient;
client.distube = distube;

// Initialize and start LoL Tracker service
const lolTracker = require('./services/lolTracker');
client.lolTracker = lolTracker;

// Initialize LoL Tracker service
lolTracker.init().then(success => {
    if (success) {
        log('LoL Tracker service initialized successfully');
    } else {
        error('Failed to initialize LoL Tracker service');
    }
}).catch(err => {
    error('Error initializing LoL Tracker service:', err);
});

// Login to Discord with your client's token
client.login(token).catch(err => {
    error('❌ Failed to login to Discord:', err);
    process.exit(1);
});
