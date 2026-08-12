const config = require('../config.json');
const { log, error } = require('../utils/utils');
const {
    fetchPelicanServer,
    fetchPelicanResources,
    startPelicanServer,
    isCountdownInProgress,
    getLastPowerActionAt,
    waitUntilOnline,
    notifyPalworldOnline,
    notifyPalworldChannel,
} = require('./palworldUpdate');

const DEFAULT_COOLDOWN_MINUTES = 5;
const DEFAULT_QUIET_START = '05:55';
const DEFAULT_QUIET_MINUTES = 10;

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

async function notifyCrashRestart(client, _server, _state) {
    await notifyPalworldChannel(client, {
        title: 'Palworld went down',
        description: 'The server crashed or stopped — bringing it back up now.',
        color: 0xed4245,
        timestamp: new Date().toISOString(),
    });
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
            await notifyPalworldOnline(client, server, result.waitedMs, 'crash').catch((e) =>
                error(e, 'Palworld online notify')
            );
        } else {
            log(`Palworld: still not online after ${Math.round(result.waitedMs / 1000)}s (state="${result.state}")`);
            await notifyPalworldChannel(client, {
                title: 'Palworld is taking longer than usual',
                description:
                    'A restart was started after the crash, but the server is not back online yet. Hang tight — it may still be loading.',
                color: 0xfaa61a,
                timestamp: new Date().toISOString(),
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
