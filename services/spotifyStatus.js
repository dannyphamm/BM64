const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle } = require('discord.js');
const { error, log } = require('../utils/utils');
const { socketIO } = require('../utils/socket.js');
const config = require('../config');
const { ActivityType } = require('discord.js');

// Constants
const RETRY_DELAY = 3000;
const CLEAR_DELAY = 1500;
const AD_RETRY_DELAY = 5000;
const BUFFER_TIME = 2500;
const QUEUE_LIMIT = 5;
const EMBED_COLOR = 0x0099ff;
const SOCKET_TIMEOUT = 10000;
const SHORT_SOCKET_TIMEOUT = 3000;
/** Discord voice channel status max length (undocumented; keep conservative). */
const VOICE_CHANNEL_STATUS_MAX = 500;

// State management
class SpotifyStatusManager {
    constructor() {
        this.timeoutIds = [];
        this.currentTimeoutId = null;
        this.progressMs = 0;
        this.durationMs = 0;
        this.remainingMs = 0;
        this.buttons = this.createButtons();
    }

    createButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('skip')
                    .setLabel('Skip')
                    .setDisabled(false)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('remove')
                    .setLabel('Remove')
                    .setDisabled(false)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('reset')
                    .setLabel('Broken?')
                    .setDisabled(false)
                    .setStyle(ButtonStyle.Danger)
            );
    }

    clearTimeouts() {
        if (this.currentTimeoutId) {
            clearTimeout(this.currentTimeoutId);
        }
        this.timeoutIds.forEach(id => clearTimeout(id));
        this.timeoutIds = [];
        //log("Clearing timeouts");
    }

    createTrackedTimeout(callback, ms) {
        const id = setTimeout(callback, ms);
        this.timeoutIds.push(id);
        return id;
    }

    clearAllTimeouts() {
        this.clearTimeouts();
        //log("All timeouts cleared");
    }
}

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text, maxLength = 256) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

/**
 * Undocumented API — see https://gist.github.com/EchterTimo/9c5333c8a6272883510c38dd0cff5f60
 * and discord-api-docs PRs around voice-status.
 */
async function updateVoiceChannelStatus(statusText) {
    const channelId = config.misamoVoiceChannel;
    const token = config.token;
    if (!channelId || !token) return;

    const status = statusText != null && statusText !== ''
        ? truncateText(String(statusText), VOICE_CHANNEL_STATUS_MAX)
        : '';

    const url = `https://discord.com/api/v9/channels/${channelId}/voice-status`;
    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordBot',
            },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            error(`Voice channel status failed: ${res.status} ${body}`);
        }
    } catch (e) {
        error('Failed to update voice channel status:', e);
    }
}

const formatDuration = (ms) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

// Socket API wrapper (replaces deprecated Spotify Web API for current/previous track)
class SocketWrapper {
    static async getServer() {
        try {
            return await socketIO();
        } catch (e) {
            error('Failed to get socket.io server:', e);
            return null;
        }
    }

    static async hasClients(io) {
        try {
            const sockets = await io.fetchSockets();
            return sockets.length > 0;
        } catch (e) {
            error('Failed to fetch socket clients:', e);
            return false;
        }
    }

    /**
     * Broadcast with ack. Never throws — returns null on timeout / no clients.
     * (Timeouts previously rejected and could crash Discord.js Client via captureRejections.)
     */
    static async emitWithAck(event, timeoutMs = SHORT_SOCKET_TIMEOUT, ...args) {
        const io = await this.getServer();
        if (!io) return null;

        if (!(await this.hasClients(io))) {
            log(`Socket skip ${event}: no clients connected`);
            return null;
        }

        try {
            return await io.timeout(timeoutMs).emitWithAck(event, ...args);
        } catch (e) {
            // Typical when Spotify browser tab is on an ad / unresponsive: responses: []
            log(`Socket failure ${event}: ${e?.message || e}`);
            return null;
        }
    }

    static getQueue() {
        return this.emitWithAck('getQueue', SOCKET_TIMEOUT);
    }

    static getPlayLength() {
        return this.emitWithAck('getPlayLength', SHORT_SOCKET_TIMEOUT);
    }

    static getCurrentSong() {
        return this.emitWithAck('getCurrentSong', SHORT_SOCKET_TIMEOUT);
    }

    static getPrevious() {
        return this.emitWithAck('getPrevious', SHORT_SOCKET_TIMEOUT);
    }

    static async skipMusic() {
        try {
            const io = await this.getServer();
            if (!io || !(await this.hasClients(io))) return;
            io.emit('skipMusic');
        } catch (e) {
            error('Failed to skip music:', e);
        }
    }
}

// Embed creation functions
class EmbedBuilder {
    static createNextUpEmbed(queue) {
        if (!queue || queue.length === 0) {
            return {
                color: EMBED_COLOR,
                title: 'Next Up',
                fields: [{
                    name: 'Queue Empty',
                    value: 'No songs in queue',
                }]
            };
        }

        return {
            color: EMBED_COLOR,
            title: 'Next Up',
            fields: queue.slice(0, QUEUE_LIMIT).map((track, index) => ({
                name: truncateText(`${index + 1}. ${track.name}`),
                value: truncateText(track.artists || 'Unknown Artist'),
            }))
        };
    }

    static createCurrentEmbed(track, status = '') {
        if (!track) {
            return {
                color: EMBED_COLOR,
                title: 'Currently Playing',
                fields: [{
                    name: 'No Track Playing',
                    value: status || 'Nothing is currently playing',
                }]
            };
        }

        // Socket API: { name, artist } (string). Legacy: { name, artists: [{ name }] }.
        const artistNames = track.artist ?? track.artists?.map(a => a.name).join(', ') ?? 'Unknown Artist';
        return {
            color: EMBED_COLOR,
            title: 'Currently Playing',
            fields: [{
                name: truncateText(track.name || 'Unknown Track'),
                value: truncateText(artistNames),
            }]
        };
    }

    static createPreviousEmbed(tracks) {
        if (!tracks || tracks.length === 0) {
            return {
                color: EMBED_COLOR,
                title: 'Previously Played',
                fields: [{ name: '—', value: 'No previous track' }],
                timestamp: new Date().toISOString(),
            };
        }
        // Socket API: [{ name, artist }]. Legacy: [{ name, artists, album }].
        return {
            color: EMBED_COLOR,
            title: 'Previously Played',
            fields: tracks.map((track, index) => ({
                name: truncateText(`${index + 1}. ${track.name}`),
                value: truncateText(track.artist ?? track.artists ?? '—'),
            })),
            timestamp: new Date().toISOString(),
        };
    }
}

// Data processing functions
class DataProcessor {
    static processQueueData(data) {
        if (!data || !data[0] || data[0] === true) {
            return [];
        }
        
        return data[0].songs.map(track => ({
            name: track.name,
            artists: track.artists,
        }));
    }

    static calculateRemainingTime(progressMs, durationMs) {
        return Math.max(0, durationMs - progressMs + BUFFER_TIME);
    }
}

// Message management
class MessageManager {
    static async findOrCreateMessage(voiceChannel, client) {
        try {
            const messages = await voiceChannel.messages.fetch();
            return messages.find(msg => msg.author.id === client.user.id);
        } catch (e) {
            error('Failed to fetch messages:', e);
            return null;
        }
    }

    static async sendOrEditMessage(voiceChannel, client, embeds, components) {
        try {
            const message = await this.findOrCreateMessage(voiceChannel, client);
            
            if (!message) {
                await voiceChannel.send({ embeds, components });
            } else {
                await message.edit({ embeds, components });
            }
        } catch (e) {
            error('Failed to send/edit message:', e);
        }
    }
}

// Main service class
class SpotifyStatusService {
    constructor() {
        this.manager = new SpotifyStatusManager();
        this.running = false;
        this.pendingReload = null;
    }

    /** Schedule a future loadSpotify without growing an async recursive stack. */
    scheduleReload(client, ms, clear = true) {
        this.manager.clearTimeouts();
        this.manager.currentTimeoutId = this.manager.createTrackedTimeout(() => {
            this.loadSpotify(client, clear).catch((e) => error('Error in scheduled loadSpotify:', e));
        }, ms);
    }

    async loadSpotify(client, clear = false) {
        if (!client) {
            error('Client is required for loadSpotify');
            return;
        }

        // Coalesce overlapping calls; run one more pass after the in-flight cycle finishes.
        if (this.running) {
            this.pendingReload = { client, clear: clear || this.pendingReload?.clear };
            if (clear) this.manager.clearTimeouts();
            return;
        }
        this.running = true;

        if (clear) {
            this.manager.clearTimeouts();
            await sleep(CLEAR_DELAY);
        }

        try {
            const voiceChannel = await this.getVoiceChannel(client);
            if (!voiceChannel) {
                log('Voice channel not found, retrying in 5 seconds');
                this.scheduleReload(client, AD_RETRY_DELAY, true);
                return;
            }

            // Check for stuck state
            if (this.manager.durationMs === this.manager.progressMs && this.manager.remainingMs === 1000) {
                log("Detected stuck state, skipping track");
                await SocketWrapper.skipMusic();
            }

            const currentSongRaw = await SocketWrapper.getCurrentSong();
            const previousRaw = await SocketWrapper.getPrevious();
            const currentSong = currentSongRaw?.[0] ?? currentSongRaw;
            // getPrevious returns an array of { name, artist } (up to 10); ack may wrap as [array]
            const previousTracks = Array.isArray(previousRaw?.[0]) ? previousRaw[0] : Array.isArray(previousRaw) ? previousRaw : previousRaw ? [previousRaw] : [];

            if (currentSong && currentSong.name) {
                await this.handleActiveTrack(client, voiceChannel, currentSong, previousTracks);
            } else {
                await this.handleAdOrPaused(client, voiceChannel, previousTracks);
            }
        } catch (e) {
            error('Error in loadSpotify:', e);
            this.scheduleReload(client, RETRY_DELAY, true);
        } finally {
            this.running = false;
            if (this.pendingReload) {
                const pending = this.pendingReload;
                this.pendingReload = null;
                this.scheduleReload(pending.client, CLEAR_DELAY, pending.clear);
            }
        }
    }

    async getVoiceChannel(client) {
        try {
            return await client.channels.fetch(config.misamoVoiceChannel);
        } catch (e) {
            error('Failed to fetch voice channel:', e);
            return null;
        }
    }

    async handleActiveTrack(client, voiceChannel, currentSong, previousTracks) {
        if (voiceChannel.type !== 2) return;

        const { name, artist, progress_ms, duration_ms } = currentSong;

        // Set Discord activity (socket API: name, artist string)
        if (name) {
            const activityText = `${name} by ${artist || 'Unknown Artist'}`;
            try {
                await client.user.setActivity(activityText, { type: ActivityType.Listening });
            } catch (e) {
                error('Failed to set Discord activity:', e);
            }
            await updateVoiceChannelStatus(activityText);
        }

        const queueData = await SocketWrapper.getQueue();
        const queue = DataProcessor.processQueueData(queueData);

        const embeds = [
            EmbedBuilder.createNextUpEmbed(queue),
            EmbedBuilder.createCurrentEmbed(currentSong),
            EmbedBuilder.createPreviousEmbed(previousTracks)
        ];

        await MessageManager.sendOrEditMessage(voiceChannel, client, embeds, [this.manager.buttons]);

        this.scheduleNextUpdate(client, progress_ms, duration_ms);
    }

    async handleAdOrPaused(client, voiceChannel, previousTracks) {
        if (voiceChannel.type !== 2) return;

        log("Handling ad or paused state");

        try {
            await client.user.setActivity(null);
        } catch (e) {
            error('Failed to clear Discord activity:', e);
        }
        await updateVoiceChannelStatus('');

        const [queueData, playLengthData] = await Promise.all([
            SocketWrapper.getQueue(),
            SocketWrapper.getPlayLength()
        ]);

        const queue = DataProcessor.processQueueData(queueData);
        const playData = playLengthData?.[0] ?? playLengthData;

        if (playData) {
            this.manager.progressMs = playData.progress_ms || 0;
            this.manager.durationMs = playData.duration_ms || 0;
            this.manager.remainingMs = DataProcessor.calculateRemainingTime(
                this.manager.progressMs,
                this.manager.durationMs
            );
        }

        const embeds = [
            EmbedBuilder.createNextUpEmbed(queue),
            EmbedBuilder.createCurrentEmbed(
                playData ? { name: playData.name, artist: playData.artist } : null,
                "Ad or paused"
            ),
            EmbedBuilder.createPreviousEmbed(previousTracks)
        ];

        await MessageManager.sendOrEditMessage(voiceChannel, client, embeds, [this.manager.buttons]);

        log("No track playing, retrying in 5 seconds");
        this.scheduleReload(client, AD_RETRY_DELAY, true);
    }

    scheduleNextUpdate(client, progressMs, durationMs) {
        this.manager.progressMs = progressMs ?? 0;
        this.manager.durationMs = durationMs ?? 0;
        this.manager.remainingMs = DataProcessor.calculateRemainingTime(
            this.manager.progressMs,
            this.manager.durationMs
        );

        //log(`Progress: ${formatDuration(this.manager.progressMs)}, Duration: ${formatDuration(this.manager.durationMs)}, Remaining: ${formatDuration(this.manager.remainingMs)}`);

        if (this.manager.remainingMs > 0) {
            this.scheduleReload(client || global.discordClient, this.manager.remainingMs, true);
        } else {
            // No valid remaining time — poll again shortly instead of stalling
            this.scheduleReload(client || global.discordClient, AD_RETRY_DELAY, true);
        }
    }
}

// Global instance
const spotifyService = new SpotifyStatusService();

// Export functions
module.exports = {
    loadSpotify: (client) => spotifyService.loadSpotify(client, true),
    clearAllTimeouts: () => spotifyService.manager.clearAllTimeouts()
};