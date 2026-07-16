/**
 * Test Pelican + Steam without restarting.
 *
 *   node scripts/test-palworld-update.js
 */
const config = require('../config.json');
const { fetchPelicanServer, fetchLatestSteamEvents, pickLatestPatch } = require('../services/palworldUpdate');
const { log, error } = require('../utils/utils');

async function main() {
    log(`pelicanUrl=${config.pelicanUrl}`);
    log(`pelicanServerId=${config.pelicanServerId}`);
    log(`palworldUpdateAction=${config.palworldUpdateAction || 'notify'}`);

    const server = await fetchPelicanServer();
    log(`Pelican OK — server name: "${server.name}" (${server.identifier})`);

    const events = await fetchLatestSteamEvents(config.palworldSteamAppId || 1623730);
    const latest = pickLatestPatch(events);
    if (!latest) {
        log('Steam OK — no patchnotes events found');
    } else {
        log(`Steam OK — latest patch: "${latest.event_name}" gid=${latest.gid}`);
    }

    process.exit(0);
}

main().catch((e) => {
    error(e.response?.data || e.message || e);
    process.exit(1);
});
