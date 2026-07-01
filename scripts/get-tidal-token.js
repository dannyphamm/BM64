/**
 * One-time helper to obtain a Tidal refresh token for privateImport.
 *
 * Usage:
 *   node scripts/get-tidal-token.js
 *
 * Requires tidalPrivateClientID in config.json and a redirect URI registered
 * in the Tidal developer app (defaults to http://localhost:3000).
 */
const crypto = require('crypto');
const http = require('http');
const axios = require('axios');
const config = require('../config.json');

const CLIENT_ID = config.tidalPrivateClientID;
const REDIRECT_URI = config.tidalPrivateRedirectURI || 'http://localhost:3000';
const SCOPES = 'playlists.read playlists.write search.read';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

function createPkcePair() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

function buildAuthUrl(challenge) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state: crypto.randomBytes(16).toString('hex'),
    });
    return `https://login.tidal.com/authorize?${params.toString()}`;
}

async function exchangeCode(code, verifier) {
    const { data } = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return data;
}

async function main() {
    if (!CLIENT_ID) {
        console.error('Set tidalPrivateClientID in config.json first.');
        process.exit(1);
    }

    const { verifier, challenge } = createPkcePair();
    const authUrl = buildAuthUrl(challenge);
    const redirect = new URL(REDIRECT_URI);

    console.log('\nOpen this URL in your browser and log in to Tidal:\n');
    console.log(authUrl);
    console.log('\nWaiting for redirect...\n');

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname !== redirect.pathname) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const code = url.searchParams.get('code');
        const authError = url.searchParams.get('error');
        if (authError) {
            res.writeHead(400);
            res.end(`Authorization failed: ${authError}`);
            server.close();
            process.exit(1);
        }

        try {
            const tokens = await exchangeCode(code, verifier);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Success. You can close this tab and return to the terminal.');
            console.log('Add this to config.json:\n');
            console.log(`"tidalPrivateRefreshToken": "${tokens.refresh_token}"`);
            if (tokens.access_token) {
                console.log(`"tidalPrivateAccessToken": "${tokens.access_token}"`);
            }
        } catch (e) {
            res.writeHead(500);
            res.end('Token exchange failed. Check the terminal.');
            console.error(e.response?.data || e.message);
            process.exit(1);
        } finally {
            server.close();
        }
    });

    server.listen(Number(redirect.port) || 3000, () => {
        console.log(`Listening on ${REDIRECT_URI}`);
    });
}

main();
