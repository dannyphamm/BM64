/**
 * Validate that the Tesla sister playlist is an exact reverse of the main playlist.
 *
 *   node scripts/validate-tidal-sister-order.js
 *   node scripts/validate-tidal-sister-order.js --sample 5
 *
 * Uses tidalPrivatePlaylist + tidalSisterPlaylist from config.json.
 * Exit 0 if every position matches; exit 1 on any mismatch / missing config.
 */
const config = require('../config.json');
const { tidal, getAllPlaylistSongs } = require('../utils/tidalprivate.js');

function label(track, i) {
    if (!track) return `#${i + 1}: <missing>`;
    const artists = track.artists ? ` — ${track.artists}` : '';
    return `#${i + 1}: ${track.id} ${track.name || '?'}${artists}`;
}

async function main() {
    const mainId = config.tidalPrivatePlaylist;
    const sisterId = config.tidalSisterPlaylist;
    if (!mainId) {
        console.error('Set tidalPrivatePlaylist in config.json.');
        process.exit(1);
    }
    if (!sisterId) {
        console.error('Set tidalSisterPlaylist in config.json.');
        process.exit(1);
    }

    const sampleArgIdx = process.argv.indexOf('--sample');
    const sampleN = sampleArgIdx >= 0
        ? Math.max(1, Number(process.argv[sampleArgIdx + 1]) || 5)
        : 0;

    await tidal();

    console.log(`\nMain:   ${mainId}`);
    console.log(`Sister: ${sisterId}\n`);

    const [mainSongs, sisterSongs] = await Promise.all([
        getAllPlaylistSongs(mainId),
        getAllPlaylistSongs(sisterId),
    ]);

    console.log(`Main count:   ${mainSongs.length}`);
    console.log(`Sister count: ${sisterSongs.length}`);

    const mismatches = [];
    const maxLen = Math.max(mainSongs.length, sisterSongs.length);

    for (let i = 0; i < maxLen; i++) {
        const expected = mainSongs[mainSongs.length - 1 - i];
        const actual = sisterSongs[i];
        if (!expected || !actual || expected.id !== actual.id) {
            mismatches.push({
                index: i,
                expected,
                actual,
            });
        }
    }

    if (sampleN > 0) {
        const n = Math.min(sampleN, maxLen);
        console.log(`\nFirst ${n} sister positions (expect reverse of main):`);
        for (let i = 0; i < n; i++) {
            const expected = mainSongs[mainSongs.length - 1 - i];
            const actual = sisterSongs[i];
            const ok = expected && actual && expected.id === actual.id;
            console.log(`  [${ok ? 'OK' : 'XX'}] sister ${label(actual, i)}`);
            if (!ok) console.log(`       expected ${label(expected, i)}`);
        }
        console.log(`\nLast ${n} sister positions:`);
        for (let i = Math.max(0, sisterSongs.length - n); i < sisterSongs.length; i++) {
            const expected = mainSongs[mainSongs.length - 1 - i];
            const actual = sisterSongs[i];
            const ok = expected && actual && expected.id === actual.id;
            console.log(`  [${ok ? 'OK' : 'XX'}] sister ${label(actual, i)}`);
            if (!ok) console.log(`       expected ${label(expected, i)}`);
        }
    }

    if (mainSongs.length !== sisterSongs.length) {
        console.error(
            `\nFAIL: length mismatch (main ${mainSongs.length} vs sister ${sisterSongs.length}).`
        );
    }

    if (mismatches.length === 0 && mainSongs.length === sisterSongs.length) {
        console.log(`\nOK: all ${mainSongs.length} positions match (sister is exact reverse of main).\n`);
        process.exit(0);
    }

    const show = mismatches.slice(0, 20);
    console.error(`\nFAIL: ${mismatches.length} position mismatch(es). Showing up to 20:\n`);
    for (const m of show) {
        console.error(`  position ${m.index + 1}:`);
        console.error(`    expected ${label(m.expected, m.index)}`);
        console.error(`    actual   ${label(m.actual, m.index)}`);
    }
    if (mismatches.length > show.length) {
        console.error(`  ... and ${mismatches.length - show.length} more`);
    }
    console.error('');
    process.exit(1);
}

main().catch((e) => {
    console.error('\nFailed:', e.response?.data || e.message);
    process.exit(1);
});
