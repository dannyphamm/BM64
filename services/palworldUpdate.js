const axios = require('axios');
const config = require('../config.json');
const { log, error } = require('../utils/utils');

const STEAM_EVENTS_URL =
    'https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/';
const COLLECTION = 'PalworldSteamEvents';
const DEFAULT_WARNINGS_MINUTES = [15, 10, 5, 1];

/** Prevent overlapping countdowns if the scheduler fires again. */
let countdownInProgress = false;

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
 * Palworld Broadcast only keeps the first "word" unless spaces are NBSP.
 * See: https://github.com/Darkhand81/Palworld_broadcast_encoding_bug
 */
function broadcastCommand(message) {
    const nbsp = '\xA0';
    return `Broadcast ${String(message).replace(/ /g, nbsp)}`;
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
    log('Palworld: Pelican restart signal sent');
}

async function reinstallPelicanServer() {
    const url = `${pelicanBase()}/api/client/servers/${config.pelicanServerId}/settings/reinstall`;
    await axios.post(url, {}, { headers: pelicanHeaders(), timeout: 30000 });
    log('Palworld: Pelican reinstall queued (Steam update via egg install script)');
}

async function applyUpdateAction() {
    const action = (config.palworldUpdateAction || 'notify').toLowerCase();
    const server = await fetchPelicanServer();

    if (action === 'notify' || action === 'dry-run' || action === 'test') {
        log(`Palworld: dry-run — Pelican OK, server="${server.name}" — would countdown then restart`);
        return { action: 'notify', server };
    }

    if (countdownInProgress) {
        log('Palworld: countdown already in progress — skipping');
        return { action: 'skipped', server };
    }

    countdownInProgress = true;
    try {
        const finalAction = action === 'reinstall' ? 'reinstall' : 'restart';
        const result = await runRestartCountdown(finalAction);
        return { action: result, server };
    } finally {
        countdownInProgress = false;
    }
}

async function notifyDiscord(client, event, action, server, extra = {}) {
    const channelId = config.palworldNotifyChannel || config.settingsDiscordId;
    if (!channelId || !client) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const headline = event.announcement_body?.headline || event.event_name || 'Palworld update';
    const body = (event.announcement_body?.body || '')
        .replace(/\[\/?p\]/g, '\n')
        .replace(/\[\/?[^\]]+\]/g, '')
        .trim()
        .slice(0, 1500);

    let title;
    if (action === 'notify') {
        title = 'Palworld update detected — dry-run (no restart)';
    } else if (extra.countdownStarted) {
        title = `Palworld update — restart in ${warningMinutes()[0] || 15} minutes`;
    } else {
        title = `Palworld update detected — server ${action}`;
    }

    const fields = [
        { name: 'Event GID', value: String(event.gid), inline: true },
        { name: 'Action', value: action, inline: true },
    ];
    if (server?.name) {
        fields.push({ name: 'Pelican server', value: server.name, inline: true });
    }
    if (action === 'restart' || action === 'reinstall' || extra.countdownStarted) {
        fields.push({
            name: 'Warnings',
            value: `${warningMinutes().join(', ')} minutes`,
            inline: true,
        });
    }

    await channel.send({
        embeds: [{
            title,
            description: `**${headline}**\n\n${body || '_No details_'}`,
            color: action === 'notify' ? 0xfaa61a : 0x66c0f4,
            fields,
            url: `https://store.steampowered.com/news/app/${config.palworldSteamAppId || 1623730}`,
            timestamp: new Date().toISOString(),
            footer: { text: 'BM64 Palworld update watcher' },
        }],
    });
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

    await notifyDiscord(client, latest, actionMode, server, { countdownStarted: true })
        .catch((e) => error(e, 'Palworld notify'));

    const { action } = await applyUpdateAction();

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

    await notifyDiscord(client, latest, action, server).catch((e) => error(e, 'Palworld notify'));
}

module.exports = {
    palworldUpdateService,
    fetchLatestSteamEvents,
    fetchPelicanServer,
    pickLatestPatch,
    broadcastCommand,
    sendPelicanCommand,
    runRestartCountdown,
};
