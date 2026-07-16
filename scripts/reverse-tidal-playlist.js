/**
 * Create / refresh the sister (inverted) Tidal playlist for Tesla.
 *
 * Create sister from the main playlist (reversed order):
 *   node scripts/reverse-tidal-playlist.js --create
 *   node scripts/reverse-tidal-playlist.js --create "O2 in the DC Tesla"
 *
 * Rebuild sister from main (if tidalSisterPlaylist is set in config):
 *   node scripts/reverse-tidal-playlist.js --sync
 *
 * After --create, paste the printed UUID into config.json as tidalSisterPlaylist.
 */
const config = require('../config.json');
const {
    tidal,
    createReversedPlaylist,
    getAllPlaylistSongs,
    rebuildPlaylistNewestFirst,
} = require('../utils/tidalprivate.js');

async function syncSister() {
    const mainId = config.tidalPrivatePlaylist;
    const sisterId = config.tidalSisterPlaylist;
    if (!sisterId) {
        throw new Error('Set tidalSisterPlaylist in config.json, or run with --create first.');
    }

    const songs = await getAllPlaylistSongs(mainId);
    await rebuildPlaylistNewestFirst(sisterId, songs);

    const sisterSongs = await getAllPlaylistSongs(sisterId);
    const ok =
        songs.length === sisterSongs.length &&
        songs[0]?.id === sisterSongs[sisterSongs.length - 1]?.id &&
        songs[songs.length - 1]?.id === sisterSongs[0]?.id;

    if (!ok) {
        throw new Error(
            `Sync verify failed. Main first/last=${songs[0]?.id}/${songs[songs.length - 1]?.id} ` +
            `Sister first/last=${sisterSongs[0]?.id}/${sisterSongs[sisterSongs.length - 1]?.id}`
        );
    }

    return songs.length;
}

async function main() {
    const createFlag = process.argv.includes('--create');
    const syncFlag = process.argv.includes('--sync');
    const nameArg = createFlag
        ? process.argv[process.argv.indexOf('--create') + 1]
        : null;
    const title = nameArg && !nameArg.startsWith('-')
        ? nameArg
        : 'O2 in the DC (Tesla)';

    const sourceId = config.tidalPrivatePlaylist;
    if (!sourceId) {
        console.error('Set tidalPrivatePlaylist in config.json first.');
        process.exit(1);
    }

    await tidal();

    if (createFlag) {
        console.log(`\nCreating sister playlist "${title}" (inverted copy of ${sourceId})...\n`);
        console.log('This adds tracks one-by-one so order is correct — may take a bit.\n');
        const { playlistId, trackCount } = await createReversedPlaylist(
            sourceId,
            title,
            'Inverted mirror of the main playlist — newest first for Tesla'
        );
        console.log(`Created with ${trackCount} tracks (verified inverted).`);
        console.log('\nAdd this to config.json (keep tidalPrivatePlaylist as-is):\n');
        console.log(`"tidalSisterPlaylist": "${playlistId}"`);
        console.log(`\nOpen: https://tidal.com/playlist/${playlistId}\n`);
        console.log('Use this sister playlist in the Tesla. Main playlist stays normal order.\n');
        return;
    }

    if (syncFlag || config.tidalSisterPlaylist) {
        console.log(`\nSyncing sister ${config.tidalSisterPlaylist} from main ${sourceId}...\n`);
        const count = await syncSister();
        console.log(`Done. Sister playlist has ${count} tracks (verified newest first).`);
        console.log(`https://tidal.com/playlist/${config.tidalSisterPlaylist}\n`);
        return;
    }

    console.log('Usage:');
    console.log('  node scripts/reverse-tidal-playlist.js --create');
    console.log('  node scripts/reverse-tidal-playlist.js --sync');
}

main().catch((e) => {
    console.error('\nFailed:', e.response?.data || e.message);
    process.exit(1);
});
