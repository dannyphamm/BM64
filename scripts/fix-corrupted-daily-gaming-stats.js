/**
 * Fix daily_gaming_stats documents that were upserted with bad parser output
 * (e.g. game name = "Games Played:** 6\n\n🎮 **Fortnite").
 *
 * - Extracts real titles from 🎮 **Name** fragments inside corrupted names
 * - Merges duplicate game names (sums duration + sessions)
 * - Recalculates totalGames, totalPlayTime, hours, minutes
 *
 * Usage:
 *   node scripts/fix-corrupted-daily-gaming-stats.js --dry-run
 *   node scripts/fix-corrupted-daily-gaming-stats.js
 */

const path = require('node:path');
const { MongoClient } = require('mongodb');

const root = path.join(__dirname, '..');
const mongoConfig = require(path.join(root, 'config'));

const DRY_RUN = process.argv.includes('--dry-run');

function isCorruptedName(name) {
    if (typeof name !== 'string') return false;
    if (name.includes('\n')) return true;
    if (name.includes('🎮')) return true;
    if (/Games\s+Played/i.test(name)) return true;
    return false;
}

/** Prefer the last 🎮 **Title** / 🎮 **Title (no closing **) in the string */
function extractTitleFromCorrupted(name) {
    const matches = [...name.matchAll(/🎮\s*\*\*([^*\n]+?)(?:\*\*|$)/g)];
    if (matches.length === 0) return null;
    const title = matches[matches.length - 1][1].trim();
    return title.length > 0 ? title : null;
}

function fixGameEntry(game) {
    const name = game.name;
    if (!isCorruptedName(name)) {
        return { ...game, _changed: false };
    }
    const extracted = extractTitleFromCorrupted(name);
    if (extracted) {
        return {
            ...game,
            name: extracted,
            _changed: true,
        };
    }
    return { ...game, _changed: false, _unfixable: true };
}

function mergeGamesByName(games) {
    const map = new Map();
    for (const g of games) {
        const key = g.name;
        if (!map.has(key)) {
            map.set(key, {
                name: g.name,
                totalDuration: g.totalDuration,
                sessions: g.sessions,
            });
        } else {
            const prev = map.get(key);
            prev.totalDuration += g.totalDuration;
            prev.sessions += g.sessions;
        }
    }
    return [...map.values()].map((g) => ({
        name: g.name,
        totalDuration: g.totalDuration,
        sessions: g.sessions,
        hours: Math.floor(g.totalDuration / (1000 * 60 * 60)),
        minutes: Math.floor((g.totalDuration % (1000 * 60 * 60)) / (1000 * 60)),
    }));
}

function documentNeedsWork(doc) {
    if (!Array.isArray(doc.games)) return false;
    return doc.games.some((g) => isCorruptedName(g && g.name));
}

async function main() {
    const mongoUri = mongoConfig.mongodbURI;
    const dbName = mongoConfig.mongodbDBName;
    const client = new MongoClient(mongoUri);
    await client.connect();
    const collection = client.db(dbName).collection('daily_gaming_stats');

    const cursor = collection.find({});
    let examined = 0;
    let updated = 0;

    try {
        for await (const doc of cursor) {
            examined++;
            if (!documentNeedsWork(doc)) continue;

            const fixed = doc.games.map((g) => fixGameEntry(g));
            const dropped = fixed.filter((g) => g._unfixable);
            const kept = fixed
                .filter((g) => !g._unfixable)
                .map(({ _changed, _unfixable, ...rest }) => rest);

            const merged = mergeGamesByName(kept);
            const totalPlayTime = merged.reduce((s, g) => s + g.totalDuration, 0);

            if (merged.length === 0 && doc.games.length > 0) {
                console.warn(
                    `SKIP ${doc.date} userId=${doc.userId}: no fixable game rows (re-backfill from Discord or edit manually)`
                );
                continue;
            }

            if (dropped.length > 0) {
                console.warn(
                    `WARN ${doc.date} userId=${doc.userId}: ${dropped.length} row(s) still corrupted (manual review):`,
                    dropped.map((d) => d.name)
                );
            }

            const newDoc = {
                totalGames: merged.length,
                totalPlayTime,
                games: merged,
                updatedAt: new Date(),
            };

            if (DRY_RUN) {
                console.log(`[dry-run] would update ${doc.date} userId=${doc.userId} games=${merged.length}`);
                updated++;
                continue;
            }

            await collection.updateOne(
                { _id: doc._id },
                {
                    $set: newDoc,
                }
            );
            console.log(`updated ${doc.date} userId=${doc.userId} games=${merged.length}`);
            updated++;
        }
    } finally {
        await client.close();
    }

    console.log(`\nDone. Examined ${examined} document(s), ${DRY_RUN ? 'would update' : 'updated'} ${updated}.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
