const axios = require('axios');
const config = require('../config.json');
const { log, error } = require('../utils/utils');

const STEAM_EVENTS_URL =
    'https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/';
const COLLECTION = 'PalworldSteamEvents';
const DEFAULT_WARNINGS_MINUTES = [15, 10, 5, 1];
const ONLINE_POLL_MS = 15000;
const ONLINE_WAIT_MS = 10 * 60 * 1000;
const REINSTALL_ONLINE_WAIT_MS = 30 * 60 * 1000;

/** Prevent overlapping countdowns if the scheduler fires again. */
let countdownInProgress = false;

/** Last time we sent a Pelican power signal (start/restart). Used by crash watcher cooldown. */
let lastPowerActionAt = 0;

function notePowerAction() {
    lastPowerActionAt = Date.now();
}

function getLastPowerActionAt() {
    return lastPowerActionAt;
}

function pelicanHeaders() {
    return {
        Authorization: `Bearer ${config.pelicanApiKey}`,
        Accept: 'Application/vnd.pterodactyl.v1+json',
        'Content-Type': 'application/json',
    };
}

function pelicanBase() {
    return String(config.pelicanUrl || '').replace(/\/$/, '');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestSteamEvents(appId) {
    const { data } = await axios.get(STEAM_EVENTS_URL, {
        params: { appid: appId },
        timeout: 15000,
        headers: {
            'User-Agent': 'BM64-PalworldUpdate/1.0',
        },
    });

    if (!data?.success || !Array.isArray(data.events)) {
        throw new Error(`Unexpected Steam events response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    return data.events;
}

function isPatchEvent(event) {
    const tags = event?.announcement_body?.tags || [];
    if (tags.includes('patchnotes')) return true;
    return event?.event_type === 12;
}

function pickLatestPatch(events) {
    const patches = events.filter(isPatchEvent);
    if (!patches.length) return null;

    return patches.sort((a, b) => {
        const aTime = a.announcement_body?.posttime || a.rtime32_start_time || 0;
        const bTime = b.announcement_body?.posttime || b.rtime32_start_time || 0;
        return bTime - aTime;
    })[0];
}

async function fetchPelicanServer() {
    if (!config.pelicanUrl || !config.pelicanApiKey || !config.pelicanServerId) {
        throw new Error('pelicanUrl / pelicanApiKey / pelicanServerId not configured');
    }

    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}`;
    const { data } = await axios.get(url, { headers: pelicanHeaders(), timeout: 15000 });
    const attrs = data?.attributes || {};
    return {
        name: attrs.name || 'Unknown',
        identifier: attrs.identifier || config.pelicanServerId,
        status: attrs.status || attrs.current_state || null,
        uuid: attrs.uuid || null,
    };
}

/** Runtime state from Pelican/Pterodactyl resources endpoint. */
async function fetchPelicanResources() {
    if (!config.pelicanUrl || !config.pelicanApiKey || !config.pelicanServerId) {
        throw new Error('pelicanUrl / pelicanApiKey / pelicanServerId not configured');
    }

    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/resources`;
    const { data } = await axios.get(url, { headers: pelicanHeaders(), timeout: 15000 });
    const attrs = data?.attributes || {};
    return {
        currentState: attrs.current_state || null,
        isSuspended: Boolean(attrs.is_suspended),
        resources: attrs.resources || null,
    };
}

function isCountdownInProgress() {
    return countdownInProgress;
}

async function sendPelicanCommand(command) {
    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/command`;
    await axios.post(
        url,
        { command },
        { headers: pelicanHeaders(), timeout: 15000 }
    );
    log(`Palworld: console → ${command}`);
}

/**
 * Palworld Broadcast truncates at spaces via Pelican console.
 * Use underscores so the full message is visible in-game.
 */
function broadcastCommand(message) {
    return `Broadcast ${String(message).replace(/ /g, '_')}`;
}

function warningMinutes() {
    const configured = config.palworldRestartWarnings;
    if (Array.isArray(configured) && configured.length) {
        return configured.map(Number).filter((n) => n > 0).sort((a, b) => b - a);
    }
    return DEFAULT_WARNINGS_MINUTES;
}

function warningMessage(minutes) {
    const unit = minutes === 1 ? 'minute' : 'minutes';
    return `Server will restart in ${minutes} ${unit} for a game update. Please find a safe spot.`;
}

/**
 * Broadcast at 15, 10, 5, 1 minutes, then Save + power action.
 * @returns {Promise<'restart'|'reinstall'|'notify'>}
 */
async function runRestartCountdown(finalAction) {
    const warnings = warningMinutes();
    const longest = warnings[0] || 15;

    log(`Palworld: starting ${longest}-minute restart countdown (${warnings.join(', ')} min warnings)`);

    for (let i = 0; i < warnings.length; i++) {
        const minutes = warnings[i];
        try {
            await sendPelicanCommand(broadcastCommand(warningMessage(minutes)));
        } catch (e) {
            error(e.response?.data || e, `Palworld broadcast ${minutes}m`);
        }

        const nextMinutes = warnings[i + 1] || 0;
        const waitMinutes = minutes - nextMinutes;
        if (waitMinutes > 0) {
            await sleep(waitMinutes * 60 * 1000);
        }
    }

    try {
        await sendPelicanCommand(broadcastCommand('Server restarting now for a game update. See you soon!'));
        await sendPelicanCommand('Save');
        await sleep(5000);
    } catch (e) {
        error(e.response?.data || e, 'Palworld pre-restart commands');
    }

    if (finalAction === 'reinstall') {
        await reinstallPelicanServer();
        return 'reinstall';
    }

    await restartPelicanServer();
    return 'restart';
}

async function restartPelicanServer() {
    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/power`;
    await axios.post(url, { signal: 'restart' }, { headers: pelicanHeaders(), timeout: 30000 });
    notePowerAction();
    log('Palworld: Pelican restart signal sent');
}

async function startPelicanServer() {
    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/power`;
    await axios.post(url, { signal: 'start' }, { headers: pelicanHeaders(), timeout: 30000 });
    notePowerAction();
    log('Palworld: Pelican start signal sent');
}

async function reinstallPelicanServer() {
    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/settings/reinstall`;
    await axios.post(url, {}, { headers: pelicanHeaders(), timeout: 30000 });
    log('Palworld: Pelican reinstall queued (Steam update via egg install script)');
}

/**
 * Poll until Pelican reports running, or timeout.
 * @param {number} [timeoutMs]
 * @param {{ requireOfflineFirst?: boolean }} [options]
 *   When true (update restart), wait until the server leaves `running` first
 *   so we don't treat the pre-restart state as "back online".
 * @returns {Promise<{ online: boolean, waitedMs: number, state: string|null }>}
 */
async function waitUntilOnline(timeoutMs = ONLINE_WAIT_MS, options = {}) {
    const requireOfflineFirst = Boolean(options.requireOfflineFirst);
    const started = Date.now();
    let state = null;
    let leftRunning = !requireOfflineFirst;

    while (Date.now() - started < timeoutMs) {
        const resources = await fetchPelicanResources();
        state = resources.currentState;

        if (state && state !== 'running') {
            leftRunning = true;
        }

        if (state === 'running' && leftRunning) {
            return { online: true, waitedMs: Date.now() - started, state };
        }
        await sleep(ONLINE_POLL_MS);
    }

    return { online: false, waitedMs: Date.now() - started, state };
}

async function notifyPalworldChannel(client, embedOrEmbeds) {
    const channelId = config.palworldNotifyChannel || config.settingsDiscordId;
    if (!channelId || !client) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embeds = Array.isArray(embedOrEmbeds) ? embedOrEmbeds : [embedOrEmbeds];
    // One embed per message keeps us under Discord's 6000-char total embed limit.
    for (const embed of embeds) {
        await channel.send({ embeds: [embed] });
    }
}

async function notifyPalworldOnline(client, _server, _waitedMs, reason = 'crash') {
    const description =
        reason === 'update'
            ? 'The update restart finished — you can hop back on.'
            : 'The server recovered — you can hop back on.';

    await notifyPalworldChannel(client, {
        title: 'Palworld is ON',
        description,
        color: 0x57f287,
        timestamp: new Date().toISOString(),
    });
}

function formatPatchNotes(event) {
    const raw = event?.announcement_body?.body || '';
    return raw
        .replace(/\[\/?p\]/gi, '\n')
        .replace(/\[\/?h\d\]/gi, '\n')
        .replace(/\[\*\]/g, '• ')
        .replace(/\[\/?(list|olist|b|i|u|url[^\]]*)\]/gi, '')
        .replace(/\[\/?[^\]]+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Split text into Discord-safe embed description chunks (prefer newline breaks). */
function splitTextIntoChunks(text, maxLen = 4096) {
    if (!text) return [];
    if (text.length <= maxLen) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        let splitAt = remaining.lastIndexOf('\n', maxLen);
        if (splitAt <= 0 || splitAt < maxLen * 0.5) {
            splitAt = remaining.lastIndexOf(' ', maxLen);
        }
        if (splitAt <= 0) {
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt).trimEnd());
        remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
}

async function notifyDiscord(client, event, action, _server, extra = {}) {
    const headline = event.announcement_body?.headline || event.event_name || 'a new patch';
    const minutes = warningMinutes()[0] || 15;
    const notes = formatPatchNotes(event);
    const steamUrl = `https://store.steampowered.com/news/app/${config.palworldSteamAppId || 1623730}`;

    let title;
    let intro;
    let color = 0x66c0f4;

    if (action === 'notify') {
        title = 'Palworld update available';
        intro = `**${headline}**\n\nDetected a new patch (test mode — server will not restart).`;
        color = 0xfaa61a;
    } else if (extra.countdownStarted) {
        title = 'Palworld update — restart soon';
        intro =
            `**${headline}**\n\n` +
            `The server will restart in **${minutes} minutes** for a game update.\n` +
            `Please find a safe spot and log off before then.`;
    } else {
        title = 'Palworld update';
        intro = `**${headline}**`;
    }

    if (notes) {
        intro += '\n\n_Release notes follow in the next message(s)._';
    }

    const embeds = [{
        title,
        description: intro,
        color,
        url: steamUrl,
        timestamp: new Date().toISOString(),
    }];

    const noteChunks = splitTextIntoChunks(notes);
    noteChunks.forEach((chunk, i) => {
        const part = noteChunks.length > 1 ? ` (${i + 1}/${noteChunks.length})` : '';
        embeds.push({
            title: `Release notes${part}`,
            description: chunk,
            color,
            url: steamUrl,
        });
    });

    await notifyPalworldChannel(client, embeds);
}

/**
 * Poll Steam partner events for Palworld. On a new patchnotes event,
 * warn players (15/10/5/1 min) then restart (or reinstall) via Pelican.
 */
async function palworldUpdateService(client, options = {}) {
    if (!config.pelicanUrl || !config.pelicanApiKey || !config.pelicanServerId) {
        log('Palworld: pelicanUrl / pelicanApiKey / pelicanServerId not configured — skipping');
        return;
    }

    if (countdownInProgress && !options.forceTest) {
        return;
    }

    const appId = config.palworldSteamAppId || 1623730;
    const events = await fetchLatestSteamEvents(appId);
    const latest = pickLatestPatch(events);

    if (!latest) {
        log('Palworld: no patchnotes events found');
        return;
    }

    const state = client.mongodb.db.collection(COLLECTION);
    const previous = await state.findOne({ appId: String(appId) });

    if (!previous && !options.forceTest) {
        const server = await fetchPelicanServer();
        await state.insertOne({
            appId: String(appId),
            lastGid: String(latest.gid),
            lastHeadline: latest.announcement_body?.headline || latest.event_name,
            lastPosttime: latest.announcement_body?.posttime || null,
            pelicanServerName: server.name,
            updatedAt: new Date(),
        });
        log(`Palworld: seeded last patch gid=${latest.gid} (${latest.event_name}), Pelican="${server.name}" — no action`);
        return;
    }

    if (!options.forceTest && previous && String(previous.lastGid) === String(latest.gid)) {
        return;
    }

    if (options.forceTest) {
        log(`Palworld: force test against current patch gid=${latest.gid} "${latest.event_name}"`);
    } else {
        log(`Palworld: new update gid=${latest.gid} "${latest.event_name}" (was ${previous.lastGid})`);
    }

    const server = await fetchPelicanServer();
    const actionMode = (config.palworldUpdateAction || 'notify').toLowerCase();

    // Claim the update before the long countdown so the next poll does not re-trigger
    if (!options.forceTest) {
        await state.updateOne(
            { appId: String(appId) },
            {
                $set: {
                    lastGid: String(latest.gid),
                    lastHeadline: latest.announcement_body?.headline || latest.event_name,
                    lastPosttime: latest.announcement_body?.posttime || null,
                    pelicanServerName: server.name,
                    countdownStartedAt: new Date(),
                    updatedAt: new Date(),
                },
            },
            { upsert: true }
        );
    }

    if (actionMode === 'notify' || actionMode === 'dry-run' || actionMode === 'test' || options.forceTest) {
        await notifyDiscord(client, latest, 'notify', server).catch((e) => error(e, 'Palworld notify'));
        log(`Palworld: dry-run — Pelican OK, server="${server.name}" — would countdown then restart`);
        return;
    }

    // Hold this for the whole countdown + restart + boot wait so the 10-min
    // poll and crash watcher cannot re-trigger mid-flow.
    if (countdownInProgress) {
        log('Palworld: countdown already in progress — skipping');
        return;
    }

    countdownInProgress = true;
    try {
        await notifyDiscord(client, latest, actionMode, server, { countdownStarted: true })
            .catch((e) => error(e, 'Palworld notify'));

        const finalAction = actionMode === 'reinstall' ? 'reinstall' : 'restart';
        const action = await runRestartCountdown(finalAction);

        if (!options.forceTest) {
            await state.updateOne(
                { appId: String(appId) },
                {
                    $set: {
                        lastAction: action,
                        countdownFinishedAt: new Date(),
                        updatedAt: new Date(),
                    },
                }
            );
        }

        const onlineTimeout =
            action === 'reinstall' ? REINSTALL_ONLINE_WAIT_MS : ONLINE_WAIT_MS;
        log(`Palworld: ${action} signaled — waiting for server to come online…`);
        const result = await waitUntilOnline(onlineTimeout, { requireOfflineFirst: true });

        if (result.online) {
            log(`Palworld: server online after update (${Math.round(result.waitedMs / 1000)}s)`);
            await notifyPalworldOnline(client, server, result.waitedMs, 'update').catch((e) =>
                error(e, 'Palworld update online notify')
            );
        } else {
            log(
                `Palworld: still not online after update (${Math.round(result.waitedMs / 1000)}s, state="${result.state}")`
            );
            await notifyPalworldChannel(client, {
                title: 'Palworld is taking longer than usual',
                description:
                    'The update restart was started, but the server is not back online yet. Hang tight — it may still be loading.',
                color: 0xfaa61a,
                timestamp: new Date().toISOString(),
            }).catch((e) => error(e, 'Palworld update timeout notify'));
        }
    } finally {
        countdownInProgress = false;
    }
}

module.exports = {
    palworldUpdateService,
    fetchLatestSteamEvents,
    fetchPelicanServer,
    fetchPelicanResources,
    pickLatestPatch,
    broadcastCommand,
    sendPelicanCommand,
    runRestartCountdown,
    startPelicanServer,
    restartPelicanServer,
    isCountdownInProgress,
    getLastPowerActionAt,
    waitUntilOnline,
    notifyPalworldOnline,
    notifyPalworldChannel,
    ONLINE_WAIT_MS,
};
