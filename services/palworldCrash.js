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
const DEFAULT_QUIET_START = '05:55';
const DEFAULT_QUIET_MINUTES = 10;
const ONLINE_POLL_MS = 15000;
const ONLINE_WAIT_MS = 10 * 60 * 1000;

/** Prevent overlapping checks / start spam. */
let checkInProgress = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function quietWindowConfig() {
    const start = String(config.palworldCrashQuietStart || DEFAULT_QUIET_START);
    const minutes = Number(config.palworldCrashQuietMinutes);
    return {
        start,
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_QUIET_MINUTES,
    };
}

/** Skip crash auto-start during Pelican's daily scheduled restart (local bot time). */
function isInQuietWindow(now = new Date()) {
    const { start, minutes } = quietWindowConfig();
    const match = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
    if (!match) return false;

    const startHour = Number(match[1]);
    const startMin = Number(match[2]);
    if (startHour > 23 || startMin > 59) return false;

    const startTotal = startHour * 60 + startMin;
    const nowTotal = now.getHours() * 60 + now.getMinutes();
    const endTotal = startTotal + minutes;
    const dayMinutes = 24 * 60;

    if (endTotal <= dayMinutes) {
        return nowTotal >= startTotal && nowTotal < endTotal;
    }
    // Window wraps past midnight
    return nowTotal >= startTotal || nowTotal < (endTotal % dayMinutes);
}

async function notifyChannel(client, embed) {
    const channelId = config.palworldNotifyChannel || config.settingsDiscordId;
    if (!channelId || !client) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    await channel.send({ embeds: [embed] });
}

async function notifyCrashRestart(client, server, state) {
    await notifyChannel(client, {
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
    });
}

async function notifyServerOnline(client, server, waitedMs) {
    const seconds = Math.round(waitedMs / 1000);
    await notifyChannel(client, {
        title: 'Palworld is ON',
        description: 'Server is back online after a crash restart.',
        color: 0x57f287,
        fields: [
            { name: 'State', value: 'running', inline: true },
            { name: 'Boot wait', value: `${seconds}s`, inline: true },
            ...(server?.name
                ? [{ name: 'Pelican server', value: server.name, inline: true }]
                : []),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'BM64 Palworld crash watcher' },
    });
}

/**
 * Poll until Pelican reports running, or timeout.
 * @returns {Promise<{ online: boolean, waitedMs: number, state: string|null }>}
 */
async function waitUntilOnline(timeoutMs = ONLINE_WAIT_MS) {
    const started = Date.now();
    let state = null;

    while (Date.now() - started < timeoutMs) {
        const resources = await fetchPelicanResources();
        state = resources.currentState;
        if (state === 'running') {
            return { online: true, waitedMs: Date.now() - started, state };
        }
        await sleep(ONLINE_POLL_MS);
    }

    return { online: false, waitedMs: Date.now() - started, state };
}

/**
 * Poll Pelican resources. If the Palworld server is offline (crashed/stopped),
 * send a start signal. Skips during update countdowns, the daily quiet window,
 * and respects a cooldown so boot/restart windows are not spammed.
 */
async function palworldCrashService(client) {
    if (!crashDetectionEnabled()) return;
    if (isCountdownInProgress()) return;
    if (isInQuietWindow()) {
        // Avoid fighting Pelican's daily restart schedule
        return;
    }
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

        log('Palworld: waiting for server to come online…');
        const result = await waitUntilOnline();
        if (result.online) {
            log(`Palworld: server online after ${Math.round(result.waitedMs / 1000)}s`);
            await notifyServerOnline(client, server, result.waitedMs).catch((e) =>
                error(e, 'Palworld online notify')
            );
        } else {
            log(`Palworld: still not online after ${Math.round(result.waitedMs / 1000)}s (state="${result.state}")`);
            await notifyChannel(client, {
                title: 'Palworld start timed out',
                description: `Sent start after a crash, but Pelican never reported \`running\` within ${Math.round(ONLINE_WAIT_MS / 60000)} minutes.`,
                color: 0xfaa61a,
                fields: [
                    { name: 'Last state', value: String(result.state || 'unknown'), inline: true },
                    ...(server?.name
                        ? [{ name: 'Pelican server', value: server.name, inline: true }]
                        : []),
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'BM64 Palworld crash watcher' },
            }).catch((e) => error(e, 'Palworld timeout notify'));
        }
    } finally {
        checkInProgress = false;
    }
}

module.exports = {
    palworldCrashService,
    isInQuietWindow,
};
