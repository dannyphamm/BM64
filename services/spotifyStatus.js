//const { spotify } = require('../utils/spotify.js_deprecate');
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
const RECENT_TRACKS_LIMIT = 10;
const EMBED_COLOR = 0x0099ff;
const SOCKET_TIMEOUT = 10000;
const SHORT_SOCKET_TIMEOUT = 3000;

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
        log("Clearing timeouts");
    }

    createTrackedTimeout(callback, ms) {
        const id = setTimeout(callback, ms);
        this.timeoutIds.push(id);
        return id;
    }

    clearAllTimeouts() {
        this.clearTimeouts();
        log("All timeouts cleared");
    }
}

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const truncateText = (text, maxLength = 256) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

const formatDuration = (ms) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

// API wrapper functions
class SpotifyAPIWrapper {
    static async getCurrentTrack(spotifyApi) {
        try {
            return await spotifyApi.getMyCurrentPlayingTrack();
        } catch (e) {
            log("Spotify API failure, retrying in 3 seconds");
            error(e);
            await sleep(RETRY_DELAY);
            throw e;
        }
    }

    static async getRecentTracks(spotifyApi) {
        try {
            return await spotifyApi.getMyRecentlyPlayedTracks({ limit: RECENT_TRACKS_LIMIT });
        } catch (e) {
            log("Spotify API failure, retrying in 3 seconds");
            error(e);
            await sleep(RETRY_DELAY);
            throw e;
        }
    }
}

class SocketWrapper {
    static async getQueue() {
        try {
            const socket = await socketIO();
            return await socket.timeout(SOCKET_TIMEOUT).emitWithAck('getQueue');
        } catch (e) {
            log("Socket failure, retrying in 3 seconds");
            error(e);
            await sleep(RETRY_DELAY);
            throw e;
        }
    }

    static async getPlayLength() {
        try {
            const socket = await socketIO();
            return await socket.timeout(SHORT_SOCKET_TIMEOUT).emitWithAck('getPlayLength');
        } catch (e) {
            log("Socket failure, retrying in 3 seconds");
            error(e);
            await sleep(RETRY_DELAY);
            throw e;
        }
    }

    static async skipMusic() {
        try {
            const socket = await socketIO();
            socket.emit('skipMusic');
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

        const artistNames = track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist';
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
        return {
            color: EMBED_COLOR,
            title: 'Previously Played',
            fields: tracks.map((track, index) => ({
                name: truncateText(`${index + 1}. ${track.name} - ${track.artists}`),
                value: truncateText(track.album || 'No Album'),
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

    static processRecentTracks(recentTracks) {
        return recentTracks.body.items.map(item => ({
            name: item.track.name,
            artists: item.track.artists.map(artist => artist.name).join(', '),
            album: item.track.album.name,
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
    }

    async loadSpotify(client, clear = false) {
        if (!client) {
            error('Client is required for loadSpotify');
            return;
        }

        if (clear) {
            this.manager.clearTimeouts();
            await sleep(CLEAR_DELAY);
        }

        try {
            const spotifyApi = await spotify();
            const voiceChannel = await this.getVoiceChannel(client);
            
            if (!voiceChannel) {
                log('Voice channel not found, retrying in 5 seconds');
                await sleep(AD_RETRY_DELAY);
                return this.loadSpotify(client, true);
            }

            //const currentTrack = await SpotifyAPIWrapper.getCurrentTrack(spotifyApi);
            
            // Check for stuck state
            if (this.manager.durationMs === this.manager.progressMs && this.manager.remainingMs === 1000) {
                log("Detected stuck state, skipping track");
                await SocketWrapper.skipMusic();
            }

            if (currentTrack.body) {
                await this.handleTrackPlaying(client, voiceChannel, spotifyApi, currentTrack);
            } else {
                await this.handleNoTrackPlaying(client, voiceChannel);
            }

        } catch (e) {
            error('Error in loadSpotify:', e);
            await sleep(RETRY_DELAY);
            return this.loadSpotify(client, true);
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

    async handleTrackPlaying(client, voiceChannel, spotifyApi, currentTrack) {
        const { currently_playing_type, is_playing } = currentTrack.body;

        if (currently_playing_type === 'track' && is_playing) {
            await this.handleActiveTrack(client, voiceChannel, spotifyApi, currentTrack);
        } else if (currently_playing_type === 'ad' || !is_playing) {
            await this.handleAdOrPaused(client, voiceChannel, spotifyApi, currentTrack);
        }
    }

    async handleActiveTrack(client, voiceChannel, spotifyApi, currentTrack) {
        if (voiceChannel.type !== 2) return;

        const current = currentTrack.body.item;
        
        // Set Discord activity for current song
        if (current && current.name) {
            const artistNames = current.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist';
            const activityText = `${current.name} by ${artistNames}`;
            try {
                await client.user.setActivity(activityText, { type: ActivityType.Listening });
            } catch (e) {
                error('Failed to set Discord activity:', e);
            }
        }
        
        // Get queue and recent tracks
        const [queueData, recentTracks] = await Promise.all([
            SocketWrapper.getQueue().catch(() => null),
            //SpotifyAPIWrapper.getRecentTracks(spotifyApi).catch(() => null)
        ]);

        const queue = DataProcessor.processQueueData(queueData);
        const tracks = recentTracks ? DataProcessor.processRecentTracks(recentTracks) : [];

        // Create embeds
        const embeds = [
            EmbedBuilder.createNextUpEmbed(queue),
            EmbedBuilder.createCurrentEmbed(current),
            EmbedBuilder.createPreviousEmbed(tracks)
        ];

        // Send message
        await MessageManager.sendOrEditMessage(voiceChannel, client, embeds, [this.manager.buttons]);

        // Schedule next update
        this.scheduleNextUpdate(currentTrack);
    }

    async handleAdOrPaused(client, voiceChannel, spotifyApi, currentTrack) {
        if (voiceChannel.type !== 2) return;

        log("Handling ad or paused state");
        
        // Clear Discord activity since ad is playing or music is paused
        try {
            await client.user.setActivity(null);
        } catch (e) {
            error('Failed to clear Discord activity:', e);
        }

        // Get queue and recent tracks
        const [queueData, recentTracks, playLengthData] = await Promise.all([
            SocketWrapper.getQueue().catch(() => null),
            //SpotifyAPIWrapper.getRecentTracks(spotifyApi).catch(() => null),
            SocketWrapper.getPlayLength().catch(() => null)
        ]);

        const queue = DataProcessor.processQueueData(queueData);
        const tracks = recentTracks ? DataProcessor.processRecentTracks(recentTracks) : [];
        const playData = playLengthData?.[0];

        // Update timing data
        if (playData) {
            this.manager.progressMs = playData.progress_ms || 0;
            this.manager.durationMs = playData.duration_ms || 0;
            this.manager.remainingMs = DataProcessor.calculateRemainingTime(
                this.manager.progressMs, 
                this.manager.durationMs
            );
        }

        // Create embeds
        const embeds = [
            EmbedBuilder.createNextUpEmbed(queue),
            EmbedBuilder.createCurrentEmbed(
                playData ? { name: playData.name, artists: [{ name: playData.artist }] } : null,
                "Ad is currently running"
            ),
            EmbedBuilder.createPreviousEmbed(tracks)
        ];

        // Send message
        await MessageManager.sendOrEditMessage(voiceChannel, client, embeds, [this.manager.buttons]);

        // Schedule retry
        log("No track playing, retrying in 5 seconds");
        await sleep(AD_RETRY_DELAY);
        return this.loadSpotify(client, true);
    }

    async handleNoTrackPlaying(client, voiceChannel) {
        if (voiceChannel && voiceChannel.type === 2) {
            // Could implement clearing voice channel status here
            log("No track currently playing");
        }
        
        // Clear Discord activity since no track is playing
        try {
            await client.user.setActivity(null);
        } catch (e) {
            error('Failed to clear Discord activity:', e);
        }
    }

    scheduleNextUpdate(currentTrack) {
        this.manager.progressMs = currentTrack.body.progress_ms;
        this.manager.durationMs = currentTrack.body.item.duration_ms;
        this.manager.remainingMs = DataProcessor.calculateRemainingTime(
            this.manager.progressMs, 
            this.manager.durationMs
        );

        log(`Progress: ${formatDuration(this.manager.progressMs)}, Duration: ${formatDuration(this.manager.durationMs)}, Remaining: ${formatDuration(this.manager.remainingMs)}`);

        if (this.manager.remainingMs > 0) {
            this.manager.currentTimeoutId = this.manager.createTrackedTimeout(
                () => this.loadSpotify(global.discordClient, true),
                this.manager.remainingMs
            );
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