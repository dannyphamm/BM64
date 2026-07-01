const axios = require('axios');

const TIDAL_CLIENT_ID = 'fX2JxdmntZWK0ixT';
const TIDAL_CLIENT_SECRET = '1Nn9AfDAjxrgJFJbKNWLeAyKGVGmINuXPPLHVXAvxAg=';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
const DEVICE_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/device_authorization';
const API_V1 = 'https://api.tidal.com/v1/';
const DEVICE_SCOPES = 'r_usr w_usr w_sub';
const CLIENT_VERSION = '2025.7.16';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36';

function apiHeaders(accessToken, extra = {}) {
    return {
        Authorization: `Bearer ${accessToken}`,
        'x-tidal-client-version': CLIENT_VERSION,
        'User-Agent': USER_AGENT,
        ...extra,
    };
}

async function startDeviceLogin() {
    const { data } = await axios.post(DEVICE_AUTH_URL, null, {
        params: {
            client_id: TIDAL_CLIENT_ID,
            scope: DEVICE_SCOPES,
        },
    });
    return {
        deviceCode: data.deviceCode,
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        verificationUriComplete: data.verificationUriComplete,
        expiresIn: data.expiresIn,
        interval: data.interval,
    };
}

async function pollDeviceLogin(deviceCode, intervalSeconds, expiresInSeconds) {
    let remaining = expiresInSeconds;
    while (remaining > 0) {
        const { data, status } = await axios.post(
            TOKEN_URL,
            new URLSearchParams({
                client_id: TIDAL_CLIENT_ID,
                client_secret: TIDAL_CLIENT_SECRET,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                scope: DEVICE_SCOPES,
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                validateStatus: () => true,
            }
        );

        if (status >= 200 && status < 300) {
            return data;
        }
        if (data?.error === 'expired_token') {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
        remaining -= intervalSeconds;
    }

    throw new Error('Login timed out. Visit link.tidal.com and enter the code, then run the script again.');
}

async function refreshAccessToken(refreshToken) {
    const { data } = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: TIDAL_CLIENT_ID,
            client_secret: TIDAL_CLIENT_SECRET,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return data;
}

async function fetchSession(accessToken) {
    const { data } = await axios.get(`${API_V1}sessions`, {
        headers: apiHeaders(accessToken),
        params: { limit: 1000 },
    });
    return {
        sessionId: data.sessionId,
        countryCode: data.countryCode,
        userId: data.userId,
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    TIDAL_CLIENT_ID,
    API_V1,
    apiHeaders,
    startDeviceLogin,
    pollDeviceLogin,
    refreshAccessToken,
    fetchSession,
    sleep,
};
