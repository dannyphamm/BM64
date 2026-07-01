/**
 * Obtain a Tidal refresh token using the same device-login flow as spotify_to_tidal.
 *
 * Usage:
 *   node scripts/get-tidal-token.js
 *
 * 1. Open the printed link (or visit link.tidal.com and enter the code)
 * 2. Log in and approve access
 * 3. The script polls until login completes and prints config values
 */
const config = require('../config.json');
const {
    startDeviceLogin,
    pollDeviceLogin,
    fetchSession,
} = require('../utils/tidalAuth.js');

function printTokens(tokens, session) {
    console.log('\nAdd these to config.json:\n');
    console.log(`"tidalPrivateRefreshToken": "${tokens.refresh_token}",`);
    console.log(`"tidalPrivateSessionId": "${session.sessionId}",`);
    console.log(`"tidalCountryCode": "${session.countryCode}"`);
    console.log('');
}

async function main() {
    console.log('\nTidal device login (same method as spotify_to_tidal)\n');

    const login = await startDeviceLogin();
    const link = login.verificationUriComplete.startsWith('http')
        ? login.verificationUriComplete
        : `https://${login.verificationUriComplete}`;

    console.log('1. Open this link in your browser:');
    console.log(`   ${link}`);
    console.log('\n2. Or go to https://link.tidal.com and enter this code:');
    console.log(`   ${login.userCode}`);
    console.log(`\n3. Waiting up to ${login.expiresIn} seconds for you to approve...\n`);

    const tokens = await pollDeviceLogin(login.deviceCode, login.interval, login.expiresIn);
    const session = await fetchSession(tokens.access_token);
    printTokens(tokens, session);

    if (config.tidalPrivateRefreshToken) {
        console.log('Note: replace any existing tidalPrivateRefreshToken / tidalPrivateSessionId values.\n');
    }
}

main().catch((e) => {
    console.error('\nFailed:', e.response?.data || e.message);
    process.exit(1);
});
