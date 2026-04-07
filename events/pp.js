const { log, error } = require('../utils/utils')
const config = require('../config.json')
const schedule = require('node-schedule')
const db = require('../utils/db')

// Normalized list: [{ userId, channelId, username }]. Supports legacy single config.
function getTrackedUsers() {
    if (Array.isArray(config.ppTracking) && config.ppTracking.length > 0) {
        return config.ppTracking.map(t => ({
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

// Per-user cache: last known status and activities (keyed by userId)
const userCache = new Map();

function getUserCache(userId) {
    if (!userCache.has(userId)) userCache.set(userId, { status: null, activities: null });
    return userCache.get(userId);
}

// Per-user daily game tracking (keyed by userId)
const dailyGameStats = new Map();

function getDailyGameStats(userId) {
    if (!dailyGameStats.has(userId)) {
        dailyGameStats.set(userId, {
            games: new Map(),
            lastActivityTime: null,
            isTracking: false,
        });
    }
    return dailyGameStats.get(userId);
}

/** YYYY-MM-DD in the process's local timezone (matches node-schedule midnight cron). */
function formatLocalYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getLocalDateTodayString() {
    return formatLocalYYYYMMDD(new Date());
}

/** Calendar day that just ended when the daily summary runs at local midnight. */
function getLocalDateYesterdayString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatLocalYYYYMMDD(d);
}

// Persist current in-memory stats to DB (no Discord message). Run periodically so DB is updated during the day.
// Skip when there is nothing to flush: after midnight, sendDailyGameSummary() clears memory; a flush with an
// empty map would upsert zeros and wipe the row the summary just wrote for that calendar day.
async function flushDailyStatsToDatabase() {
    if (config.mode === 'DEV') return;
    for (const u of getTrackedUsers()) {
        const stats = getDailyGameStats(u.userId);
        if (stats.games.size === 0) continue;
        const gamesArray = Array.from(stats.games.entries()).map(([gameName, s]) => ({
            name: gameName,
            totalDuration: s.totalDuration,
            sessions: s.sessions
        }));
        await saveDailyStatsToDatabase(gamesArray, u.userId, u.username, { dateMode: 'rolling' });
    }
}

// ~Every 15 minutes: save current daily stats to DB so YITLPP and history stay up to date.
// Use minutes 5,20,35,50 (not :00) so this never runs in the same minute as the midnight daily summary.
const flushStatsJob = schedule.scheduleJob('5,20,35,50 * * * *', async () => {
    await flushDailyStatsToDatabase();
});

// Schedule daily summary at 12 AM (all tracked users) — send message, save, then reset
const dailySummaryJob = schedule.scheduleJob('0 0 * * *', async () => {
    await global.sendDailyGameSummary();
    for (const u of getTrackedUsers()) {
        const stats = getDailyGameStats(u.userId);
        stats.games.clear();
        stats.lastActivityTime = null;
        stats.isTracking = false;
    }
});

// dateMode: 'rolling' = today's in-progress totals (flush). 'closing' = day that ended at midnight (summary).
async function saveDailyStatsToDatabase(statsData, userId, username, options = {}) {
    try {
        await db.connect();
        const collection = db.db.collection('daily_gaming_stats');
        const uid = String(userId);
        const dateMode = options.dateMode || 'rolling';
        const dateString =
            dateMode === 'closing' ? getLocalDateYesterdayString() : getLocalDateTodayString();

        const document = {
            date: dateString,
            userId: uid,
            username: username || uid,
            totalGames: statsData.length,
            totalPlayTime: statsData.reduce((total, game) => total + game.totalDuration, 0),
            games: statsData.map(game => ({
                name: game.name,
                totalDuration: game.totalDuration,
                sessions: game.sessions,
                hours: Math.floor(game.totalDuration / (1000 * 60 * 60)),
                minutes: Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60))
            })),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await collection.updateOne(
            { date: dateString, userId: uid },
            { $set: document },
            { upsert: true }
        );
    } catch (err) {
        error('Error saving daily gaming stats to database:', err);
    }
}

// Make the function globally available for the command
global.sendDailyGameSummary = async function() {
    if (config.mode === 'DEV') return;

    try {
        if (!global.discordClient) {
            error('Discord client not available for daily summary');
            return;
        }

        for (const u of getTrackedUsers()) {
            const stats = getDailyGameStats(u.userId);

            if (stats.games.size === 0) {
                await saveDailyStatsToDatabase([], u.userId, u.username, { dateMode: 'closing' });
                const channel = global.discordClient.channels.cache.get(u.channelId);
                if (channel) await channel.send('📊 **Daily Gaming Summary**\nNo games were played today.');
                continue;
            }

            const gamesArray = Array.from(stats.games.entries()).map(([gameName, s]) => ({
                name: gameName,
                totalDuration: s.totalDuration,
                sessions: s.sessions
            })).sort((a, b) => b.totalDuration - a.totalDuration);

            const totalPlayTime = gamesArray.reduce((total, game) => total + game.totalDuration, 0);
            const totalHours = Math.floor(totalPlayTime / (1000 * 60 * 60));
            const totalMinutes = Math.floor((totalPlayTime % (1000 * 60 * 60)) / (1000 * 60));

            let summaryMessage = '📊 **Daily Gaming Summary**\n\n';
            const summaryDateLabel = (() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                return d.toLocaleDateString();
            })();
            summaryMessage += `📅 **Date:** ${summaryDateLabel}\n`;
            summaryMessage += `⏱️ **Total Play Time:** ${totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`}\n`;
            summaryMessage += `🎮 **Games Played:** ${gamesArray.length}\n\n`;

            for (const game of gamesArray) {
                const hours = Math.floor(game.totalDuration / (1000 * 60 * 60));
                const minutes = Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
                const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                summaryMessage += `🎮 **${game.name}**\n`;
                summaryMessage += `⏱️ Total time: ${timeStr}\n`;
                summaryMessage += `📈 Sessions: ${game.sessions}\n\n`;
            }

            await saveDailyStatsToDatabase(gamesArray, u.userId, u.username, { dateMode: 'closing' });
            const channel = global.discordClient.channels.cache.get(u.channelId);
            if (channel) await channel.send(summaryMessage);
        }
    } catch (err) {
        error('Error sending daily game summary:', err);
    }
}

// Function to get current stats without sending message (userId optional: first tracked user if omitted)
global.getCurrentGameStats = function(userId) {
    const uid = userId ? String(userId) : (getTrackedUsers()[0] && getTrackedUsers()[0].userId);
    if (!uid) return '📊 **Current Gaming Stats**\nNo tracked users configured.';
    const stats = getDailyGameStats(uid);
    if (stats.games.size === 0) {
        return '📊 **Current Gaming Stats**\nNo games have been played today.';
    }

    let summaryMessage = '📊 **Current Gaming Stats**\n\n';
    const gamesArray = Array.from(stats.games.entries()).map(([gameName, s]) => ({
        name: gameName,
        totalDuration: s.totalDuration,
        sessions: s.sessions,
        isCurrentlyPlaying: s.startTime !== null
    })).sort((a, b) => b.totalDuration - a.totalDuration);

    for (const game of gamesArray) {
        const hours = Math.floor(game.totalDuration / (1000 * 60 * 60));
        const minutes = Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        summaryMessage += `🎮 **${game.name}**`;
        if (game.isCurrentlyPlaying) summaryMessage += ` 🔴 (Currently Playing)`;
        summaryMessage += `\n⏱️ Total time: ${timeStr}\n📈 Sessions: ${game.sessions}\n\n`;
    }
    return summaryMessage;
}

// Function to get historical stats from database (userId optional: first tracked user if omitted)
global.getHistoricalGameStats = async function(days = 7, userId) {
    try {
        await db.connect();
        const collection = db.db.collection('daily_gaming_stats');
        const uid = userId ? String(userId) : (getTrackedUsers()[0] && getTrackedUsers()[0].userId);
        if (!uid) return '📊 **Historical Gaming Stats**\nNo tracked users configured.';

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const stats = await collection.find({
            userId: uid,
            date: {
                $gte: formatLocalYYYYMMDD(startDate),
                $lte: formatLocalYYYYMMDD(endDate),
            }
        }).sort({ date: -1 }).toArray();
        
        if (stats.length === 0) {
            return `📊 **Historical Gaming Stats (Last ${days} days)**\nNo data available for the specified period.`;
        }
        
        let summaryMessage = `📊 **Historical Gaming Stats (Last ${days} days)**\n\n`;
        
        for (const dayStats of stats) {
            const date = new Date(dayStats.date).toLocaleDateString();
            const totalHours = Math.floor(dayStats.totalPlayTime / (1000 * 60 * 60));
            const totalMinutes = Math.floor((dayStats.totalPlayTime % (1000 * 60 * 60)) / (1000 * 60));
            const timeStr = totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`;
            
            summaryMessage += `📅 **${date}**\n`;
            summaryMessage += `⏱️ Total Play Time: ${timeStr}\n`;
            summaryMessage += `🎮 Games Played: ${dayStats.totalGames}\n`;
            
            if (dayStats.games && dayStats.games.length > 0) {
                summaryMessage += `📋 Games:\n`;
                dayStats.games.forEach(game => {
                    const gameTimeStr = game.hours > 0 ? `${game.hours}h ${game.minutes}m` : `${game.minutes}m`;
                    summaryMessage += `  • ${game.name}: ${gameTimeStr} (${game.sessions} sessions)\n`;
                });
            }
            summaryMessage += `\n`;
        }
        
        return summaryMessage;
    } catch (err) {
        error('Error getting historical game stats:', err);
        return '❌ Error retrieving historical gaming stats.';
    }
}

function updateGameStats(gameName, isStarting, userId) {
    if (!gameName || typeof gameName !== 'string') {
        error('Invalid game name provided to updateGameStats:', gameName);
        return;
    }
    if (!userId) return;
    const stats = getDailyGameStats(String(userId));
    const now = Date.now();

    if (isStarting) {
        if (!stats.games.has(gameName)) {
            stats.games.set(gameName, { startTime: now, totalDuration: 0, sessions: 0 });
        }
        const gameStats = stats.games.get(gameName);
        gameStats.startTime = now;
        gameStats.sessions++;
        stats.isTracking = true;
    } else {
        if (stats.games.has(gameName)) {
            const gameStats = stats.games.get(gameName);
            if (gameStats.startTime) {
                const sessionDuration = now - gameStats.startTime;
                if (sessionDuration > 0) gameStats.totalDuration += sessionDuration;
                gameStats.startTime = null;
            }
        }
    }
    stats.lastActivityTime = now;
}

module.exports = {
    name: 'presenceUpdate',
    async execute(oldState, newState) {
        if (config.mode === 'DEV') return;
        if (!oldState || !newState) return;

        const userId = newState.userId;
        const tracked = getTrackedUsers().find(u => u.userId === String(userId));
        if (!tracked) return;

        const channel = newState.client.channels.cache.get(tracked.channelId);
        const cache = getUserCache(tracked.userId);

        if (newState.status !== oldState.status) {
            const statusMessage = `${newState.user.tag} is now ${newState.status}`;
            if (cache.status !== newState.status) {
                if (channel) channel.send(statusMessage).catch(err => error(err));
                cache.status = newState.status;
            }
        }

        if (JSON.stringify(oldState.activities) !== JSON.stringify(newState.activities)) {
            const activities = newState.activities.filter(activity => activity.name !== 'Custom Status');
            const oldActivities = oldState.activities ? oldState.activities.filter(activity => activity.name !== 'Custom Status') : [];
            const currentGames = activities.filter(activity => activity.type === 0).map(activity => activity.name);
            const previousGames = oldActivities.filter(activity => activity.type === 0).map(activity => activity.name);

            previousGames.forEach(gameName => {
                if (!currentGames.includes(gameName)) updateGameStats(gameName, false, tracked.userId);
            });
            currentGames.forEach(gameName => {
                if (!previousGames.includes(gameName)) updateGameStats(gameName, true, tracked.userId);
            });

            let activityMessage;
            if (activities.length > 0) {
                activityMessage = activities.map(activity => {
                    if (activity.type === 2) return `${newState.user.tag} is listening to ${activity.name} + ${activity.details} + ${activity.state}`;
                    if (activity.type === 0) return `${newState.user.tag} is playing ${activity.name} + ${activity.details} + ${activity.state}`;
                    if (activity.type === 1) return `${newState.user.tag} is streaming ${activity.name} + ${activity.details} + ${activity.state}`;
                    if (activity.type === 3) return `${newState.user.tag} is watching ${activity.name} + ${activity.details} + ${activity.state}`;
                    return `${newState.user.tag} is now ${activity.type} + ${activity.details} + ${activity.state}`;
                }).join('\n');
            } else {
                activityMessage = `${newState.user.tag} is not currently active`;
            }

            if (cache.activities !== activityMessage) {
                if (channel) channel.send(activityMessage).catch(err => error(err));
                cache.activities = activityMessage;
            }
        }
    },
};