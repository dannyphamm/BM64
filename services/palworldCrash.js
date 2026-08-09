const config = require('../config.json');
const { log, error } = require('../utils/utils');
const {
    fetchPelicanServer,
    fetchPelicanResources,
    startPelicanServer,
    isCountdownInProgress,
    getLastPowerActionAt,
} = require('./palworldUpdate');

const DEFAULT_COOLDOWN_MINUTES = 5;

/** Prevent overlapping checks / start spam. */
let checkInProgress = false;

function crashDetectionEnabled() {
    // Default on when Pelican is configured; set palworldCrashDetection: false to disable.
    if (config.palworldCrashDetection === false) return false;
    return Boolean(config.pelicanUrl && config.pelicanApiKey && config.pelicanServerId);
}

function startCooldownMs() {
    const minutes = Number(config.palworldCrashCooldownMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
        return minutes * 60 * 1000;
    }
    return DEFAULT_COOLDOWN_MINUTES * 60 * 1000;
}

async function notifyCrashRestart(client, server, state) {
    const channelId = config.palworldNotifyChannel || config.settingsDiscordId;
    if (!channelId || !client) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    await channel.send({
        embeds: [{
            title: 'Palworld crash detected — starting server',
            color: 0xed4245,
            fields: [
                { name: 'Previous state', value: String(state || 'unknown'), inline: true },
                { name: 'Action', value: 'start', inline: true },
                ...(server?.name
                    ? [{ name: 'Pelican server', value: server.name, inline: true }]
                    : []),
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'BM64 Palworld crash watcher' },
        }],
    });
}

/**
 * Poll Pelican resources. If the Palworld server is offline (crashed/stopped),
 * send a start signal. Skips during update countdowns and respects a cooldown
 * so boot/restart windows are not spammed.
 */
async function palworldCrashService(client) {
    if (!crashDetectionEnabled()) return;
    if (isCountdownInProgress()) return;
    if (checkInProgress) return;

    checkInProgress = true;
    try {
        const resources = await fetchPelicanResources();

        if (resources.isSuspended) {
            log('Palworld crash check: server suspended — skipping');
            return;
        }

        const state = resources.currentState;
        if (state === 'running' || state === 'starting' || state === 'stopping') {
            return;
        }

        // offline, or unexpected non-running state
        const cooldown = startCooldownMs();
        const lastPower = getLastPowerActionAt();
        const sincePower = Date.now() - lastPower;
        if (lastPower && sincePower < cooldown) {
            const waitSec = Math.ceil((cooldown - sincePower) / 1000);
            log(`Palworld: state="${state}" but power cooldown (${waitSec}s left) — skipping`);
            return;
        }

        const server = await fetchPelicanServer().catch(() => null);
        log(`Palworld: crash/offline detected (state="${state}") — sending start`);
        await startPelicanServer();

        await notifyCrashRestart(client, server, state).catch((e) =>
            error(e, 'Palworld crash notify')
        );
    } finally {
        checkInProgress = false;
    }
}

module.exports = {
    palworldCrashService,
};
