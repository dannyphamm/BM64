/**
 * One-shot: rebuild daily_gaming_stats from bot messages that match the
 * "Daily Gaming Summary" format in each ppTracking channel.
 *
 * Prerequisites: messages still exist in Discord; bot token + Mongo config (same as main app).
 *
 * Usage:
 *   node scripts/backfill-daily-gaming-from-discord.js --dry-run
 *   node scripts/backfill-daily-gaming-from-discord.js
 *
 * Env:
 *   BACKFILL_MAX_MESSAGES=5000   max messages to scan per channel (default 5000)
 */

const path = require('node:path');
const { Client, IntentsBitField } = require('discord.js');
const { MongoClient } = require('mongodb');

const root = path.join(__dirname, '..');
const configJson = require(path.join(root, 'config.json'));
const mongoConfig = require(path.join(root, 'config'));

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_MESSAGES = Math.max(100, parseInt(process.env.BACKFILL_MAX_MESSAGES || '5000', 10) || 5000);

function getTrackedUsers() {
    const config = configJson;
    if (Array.isArray(config.ppTracking) && config.ppTracking.length > 0) {
        return config.ppTracking.map((t) => ({
            userId: String(t.userId),
            channelId: String(t.channelId),
            username: t.username || t.userId,
        }));
    }
    if (config.devilshinxID && config.pptracking) {
        return [{ userId: String(config.devilshinxID), channelId: String(config.pptracking), username: 'devilshinx' }];
    }
    return [];
}

/** Parse "1h 30m", "45m", "0h 5m" -> ms */
function parseTimeToMs(line) {
    const t = line.trim();
    const hMatch = t.match(/(\d+)\s*h/i);
    const mMatch = t.match(/(\d+)\s*m/i);
    let ms = 0;
    if (hMatch) ms += parseInt(hMatch[1], 10) * 3600 * 1000;
    if (mMatch) ms += parseInt(mMatch[1], 10) * 60 * 1000;
    return ms;
}

/** Try 📅 **Date:** ... -> YYYY-MM-DD (uses local interpretation of parsed Date) */
function parseDateLineFromContent(content) {
    const m = content.match(/📅\s*\*\*Date:\*\*\s*(.+)/);
    if (!m) return null;
    const raw = m[1].trim().split('\n')[0];
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

/**
 * Parse a single daily summary message. Returns null if not a match.
 */
function parseDailySummaryMessage(content, messageCreatedAt) {
    if (!content.includes('Daily Gaming Summary')) return null;

    const empty = /No games were played today/i.test(content);
    if (empty) {
        const d = messageCreatedAt;
        const dateString = d.toISOString().split('T')[0];
        return { dateString, games: [], empty: true };
    }

    let dateString = parseDateLineFromContent(content);
    if (!dateString) {
        const d = messageCreatedAt;
        dateString = d.toISOString().split('T')[0];
    }

    // Same line as pp.js: `🎮 **Games Played:** ${n}\n\n` then per-game blocks.
    // Do not parse the header with the game regex: with /s, (.+?) can span lines and pair
    // the first ** with **Fortnite**'s closer, producing a bogus first "game".
    let gameSection = content;
    const headerRe = /🎮\s*\*\*Games Played:\*\*\s*\d+\s*\n\s*\n/;
    const headerMatch = headerRe.exec(content);
    if (headerMatch) {
        gameSection = content.slice(headerMatch.index + headerMatch[0].length);
    }

    const games = [];
    // No dotAll: game title must stay on one line (matches pp.js output).
    const gameRe = /🎮\s*\*\*(.+?)\*\*\s*\n⏱️\s*Total time:\s*([^\n]+)\n📈\s*Sessions:\s*(\d+)/g;
    let gm;
    while ((gm = gameRe.exec(gameSection)) !== null) {
        const name = gm[1].trim();
        const totalDuration = parseTimeToMs(gm[2]);
        const sessions = parseInt(gm[3], 10);
        if (!name || Number.isNaN(sessions)) continue;
        if (/^Games Played$/i.test(name)) continue;
        games.push({ name, totalDuration, sessions });
    }

    if (games.length === 0) return null;
    return { dateString, games, empty: false };
}

async function fetchMessagesUpTo(channel, max) {
    const out = [];
    let before = undefined;
    while (out.length < max) {
        const batch = await channel.messages.fetch({ limit: Math.min(100, max - out.length), before });
        if (batch.size === 0) break;
        const arr = [...batch.values()];
        out.push(...arr);
        const oldest = arr.reduce((a, b) => (a.createdTimestamp < b.createdTimestamp ? a : b));
        before = oldest.id;
    }
    return out;
}

function buildDocument(statsData, userId, username, dateString) {
    const uid = String(userId);
    return {
        date: dateString,
        userId: uid,
        username: username || uid,
        totalGames: statsData.length,
        totalPlayTime: statsData.reduce((total, game) => total + game.totalDuration, 0),
        games: statsData.map((game) => ({
            name: game.name,
            totalDuration: game.totalDuration,
            sessions: game.sessions,
            hours: Math.floor(game.totalDuration / (1000 * 60 * 60)),
            minutes: Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60)),
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

async function main() {
    const tracked = getTrackedUsers();
    if (tracked.length === 0) {
        console.error('No ppTracking users in config.json');
        process.exit(1);
    }

    const myIntents = new IntentsBitField();
    myIntents.add(IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent);

    const client = new Client({ intents: myIntents });
    await client.login(configJson.token);

    const mongoUri = mongoConfig.mongodbURI;
    const dbName = mongoConfig.mongodbDBName;
    const mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const collection = mongoClient.db(dbName).collection('daily_gaming_stats');

    try {
        for (const u of tracked) {
            const channel = await client.channels.fetch(u.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                console.warn(`Skip user ${u.username}: channel ${u.channelId} not found or not text`);
                continue;
            }

            const messages = await fetchMessagesUpTo(channel, MAX_MESSAGES);
            const byDay = new Map();

            for (const msg of messages) {
                if (msg.author.id !== client.user.id) continue;
                const parsed = parseDailySummaryMessage(msg.content, msg.createdAt);
                if (!parsed) continue;
                const key = parsed.dateString;
                const prev = byDay.get(key);
                if (!prev || msg.createdTimestamp > prev.ts) {
                    byDay.set(key, { parsed, ts: msg.createdTimestamp, id: msg.id });
                }
            }

            console.log(`\n${u.username} (${u.userId}): ${byDay.size} day(s) parsed from Discord`);

            for (const [dateString, { parsed }] of byDay) {
                const statsData = parsed.games.map((g) => ({
                    name: g.name,
                    totalDuration: g.totalDuration,
                    sessions: g.sessions,
                }));
                const doc = buildDocument(statsData, u.userId, u.username, dateString);
                if (DRY_RUN) {
                    console.log(`  [dry-run] ${dateString} games=${doc.totalGames} playMs=${doc.totalPlayTime}`);
                } else {
                    await collection.updateOne(
                        { date: dateString, userId: String(u.userId) },
                        { $set: doc },
                        { upsert: true }
                    );
                    console.log(`  upsert ${dateString} games=${doc.totalGames}`);
                }
            }
        }
    } finally {
        await mongoClient.close();
        client.destroy();
    }

    console.log(DRY_RUN ? '\nDry run complete (no DB writes).' : '\nBackfill complete.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
