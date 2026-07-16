/**
 * Send a single test Broadcast to the Palworld server (no restart).
 *
 *   node scripts/test-palworld-broadcast.js
 *   node scripts/test-palworld-broadcast.js "Custom test message"
 */
const { fetchPelicanServer, sendPelicanCommand, broadcastCommand } = require('../services/palworldUpdate');
const { log, error } = require('../utils/utils');

async function main() {
    const message = process.argv.slice(2).join(' ')
        || 'Server will restart in 15 minutes for a game update. Please find a safe spot.';

    const server = await fetchPelicanServer();
    log(`Pelican OK — "${server.name}"`);
    await sendPelicanCommand(broadcastCommand(message));
    log('Broadcast sent. Check in-game chat.');
    process.exit(0);
}

main().catch((e) => {
    error(e.response?.data || e.message || e);
    process.exit(1);
});
