const { log, error } = require('../utils/utils')
const config = require('../config.json')
const schedule = require('node-schedule')
const db = require('../utils/db')

// Cache to store the last known status and activities
const userCache = {
    status: null,
    activities: null,
};

// Daily game tracking
const dailyGameStats = {
    games: new Map(), // Map to store game name -> { startTime, totalDuration, sessions }
    lastActivityTime: null,
    isTracking: false
};

// Schedule daily summary at 12 AM
const dailySummaryJob = schedule.scheduleJob('0 0 * * *', async () => {
    await global.sendDailyGameSummary();
    // Reset daily stats
    dailyGameStats.games.clear();
    dailyGameStats.lastActivityTime = null;
    dailyGameStats.isTracking = false;
});

// Function to save daily stats to database
async function saveDailyStatsToDatabase(statsData) {
    try {
        await db.connect();
        const collection = db.db.collection('daily_gaming_stats');
        
        const today = new Date();
        const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        const document = {
            date: dateString,
            userId: config.devilshinxID,
            username: 'devilshinx', // You can make this dynamic if needed
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

        // Use upsert to either insert new record or update existing one for the same date
        await collection.updateOne(
            { date: dateString, userId: config.devilshinxID },
            { $set: document },
            { upsert: true }
        );

        //log(`📊 Daily gaming stats saved to database for ${dateString}`);
    } catch (err) {
        error('Error saving daily gaming stats to database:', err);
    }
}

// Make the function globally available for the command
global.sendDailyGameSummary = async function() {
    if (config.mode === 'DEV') return;
    
    try {
        // We need to access the client from the module context
        // This will be set when the bot starts up
        if (!global.discordClient) {
            error('Discord client not available for daily summary');
            return;
        }
        
        const channel = await global.discordClient.channels.cache.find(c => c.id === config.pptracking);
        if (!channel) return;

        if (dailyGameStats.games.size === 0) {
            await channel.send('📊 **Daily Gaming Summary**\nNo games were played today.');
            // Still save empty stats to database for record keeping
            await saveDailyStatsToDatabase([]);
            return;
        }

        let summaryMessage = '📊 **Daily Gaming Summary**\n\n';
        
        // Convert games map to array and sort by total duration
        const gamesArray = Array.from(dailyGameStats.games.entries()).map(([gameName, stats]) => ({
            name: gameName,
            totalDuration: stats.totalDuration,
            sessions: stats.sessions
        })).sort((a, b) => b.totalDuration - a.totalDuration);

        // Calculate total play time for the day
        const totalPlayTime = gamesArray.reduce((total, game) => total + game.totalDuration, 0);
        const totalHours = Math.floor(totalPlayTime / (1000 * 60 * 60));
        const totalMinutes = Math.floor((totalPlayTime % (1000 * 60 * 60)) / (1000 * 60));

        summaryMessage += `📅 **Date:** ${new Date().toLocaleDateString()}\n`;
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

        await channel.send(summaryMessage);
        
        // Save stats to database after sending the message
        await saveDailyStatsToDatabase(gamesArray);
        
    } catch (err) {
        error('Error sending daily game summary:', err);
    }
}

// Function to get current stats without sending message
global.getCurrentGameStats = function() {
    if (dailyGameStats.games.size === 0) {
        return '📊 **Current Gaming Stats**\nNo games have been played today.';
    }

    let summaryMessage = '📊 **Current Gaming Stats**\n\n';
    
    // Convert games map to array and sort by total duration
    const gamesArray = Array.from(dailyGameStats.games.entries()).map(([gameName, stats]) => ({
        name: gameName,
        totalDuration: stats.totalDuration,
        sessions: stats.sessions,
        isCurrentlyPlaying: stats.startTime !== null
    })).sort((a, b) => b.totalDuration - a.totalDuration);

    for (const game of gamesArray) {
        const hours = Math.floor(game.totalDuration / (1000 * 60 * 60));
        const minutes = Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        
        summaryMessage += `🎮 **${game.name}**`;
        if (game.isCurrentlyPlaying) {
            summaryMessage += ` 🔴 (Currently Playing)`;
        }
        summaryMessage += `\n`;
        summaryMessage += `⏱️ Total time: ${timeStr}\n`;
        summaryMessage += `📈 Sessions: ${game.sessions}\n\n`;
    }

    return summaryMessage;
}

// Function to get historical stats from database
global.getHistoricalGameStats = async function(days = 7) {
    try {
        await db.connect();
        const collection = db.db.collection('daily_gaming_stats');
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const stats = await collection.find({
            userId: config.devilshinxID,
            date: {
                $gte: startDate.toISOString().split('T')[0],
                $lte: endDate.toISOString().split('T')[0]
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

function updateGameStats(gameName, isStarting) {
    if (!gameName || typeof gameName !== 'string') {
        error('Invalid game name provided to updateGameStats:', gameName);
        return;
    }
    
    const now = Date.now();
    
    if (isStarting) {
        // Starting a new game session
        if (!dailyGameStats.games.has(gameName)) {
            dailyGameStats.games.set(gameName, {
                startTime: now,
                totalDuration: 0,
                sessions: 0
            });
        }
        
        const gameStats = dailyGameStats.games.get(gameName);
        gameStats.startTime = now;
        gameStats.sessions++;
        dailyGameStats.isTracking = true;
        
        //log(`🎮 Started tracking: ${gameName} (Session #${gameStats.sessions})`);
    } else {
        // Ending a game session
        if (dailyGameStats.games.has(gameName)) {
            const gameStats = dailyGameStats.games.get(gameName);
            if (gameStats.startTime) {
                const sessionDuration = now - gameStats.startTime;
                // Only add positive duration (in case of clock issues)
                if (sessionDuration > 0) {
                    gameStats.totalDuration += sessionDuration;
                    const minutes = Math.floor(sessionDuration / (1000 * 60));
                    //log(`🎮 Stopped tracking: ${gameName} (Session duration: ${minutes}m, Total: ${Math.floor(gameStats.totalDuration / (1000 * 60))}m)`);
                }
                gameStats.startTime = null; // Reset start time
            }
        }
    }
    
    dailyGameStats.lastActivityTime = now;
}

module.exports = {
    name: 'presenceUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
            if (!oldState || !newState) return;
            const userId = newState.userId; // Get the user ID from the new state
            // Fetch the channel
            if (userId === config.devilshinxID) {
                const channel = await newState.client.channels.cache.find(c => c.id === config.pptracking);
                
                // Check if the user's status has changed
                if (newState.status !== oldState.status) {
                    const statusMessage = `${newState.user.tag} is now ${newState.status}`;
                    //log(statusMessage);
                    
                    // Send the status update to the specified channel if it's different
                    if (userCache.status !== newState.status) {
                        if (channel) {
                            channel.send(statusMessage).catch(err => error(err));
                        }
                        userCache.status = newState.status; // Update the cached status
                    }
                }

                // Check if the activity has changed
                if (JSON.stringify(oldState.activities) !== JSON.stringify(newState.activities)) {
                    const activities = newState.activities.filter(activity => activity.name !== 'Custom Status');
                    const oldActivities = oldState.activities ? oldState.activities.filter(activity => activity.name !== 'Custom Status') : [];
                    
                    // Get current and previous games
                    const currentGames = activities.filter(activity => activity.type === 0).map(activity => activity.name);
                    const previousGames = oldActivities.filter(activity => activity.type === 0).map(activity => activity.name);
                    
                    // Debug logging
                    if (currentGames.length > 0 || previousGames.length > 0) {
                        //log(`🎮 Game activity change - Previous: [${previousGames.join(', ')}], Current: [${currentGames.join(', ')}]`);
                    }
                    
                    // End sessions for games that are no longer being played
                    previousGames.forEach(gameName => {
                        if (!currentGames.includes(gameName)) {
                            //log(`🎮 Ending session for: ${gameName}`);
                            updateGameStats(gameName, false);
                        }
                    });
                    
                    // Start sessions for new games
                    currentGames.forEach(gameName => {
                        if (!previousGames.includes(gameName)) {
                            //log(`🎮 Starting session for: ${gameName}`);
                            updateGameStats(gameName, true);
                        }
                    });
                    
                    let activityMessage;

                    if (activities.length > 0) {
                        activityMessage = activities.map(activity => {
                            if (activity.type === 2) {
                                return `${newState.user.tag} is listening to ${activity.name} + ${activity.details} + ${activity.state}`;
                            } else if (activity.type === 0) {
                                return `${newState.user.tag} is playing ${activity.name} + ${activity.details} + ${activity.state}`;
                            } else if (activity.type === 1) {
                                return `${newState.user.tag} is streaming ${activity.name} + ${activity.details} + ${activity.state}`;
                            } else if (activity.type === 3) {
                                return `${newState.user.tag} is watching ${activity.name} + ${activity.details} + ${activity.state}`;
                            } else {
                                return `${newState.user.tag} is now ${activity.type} + ${activity.details} + ${activity.state}`;
                            }
                        }).join('\n');
                    } else {
                        activityMessage = `${newState.user.tag} is not currently active`;
                    }

                    // Send the activity update to the specified channel if it's different
                    if (userCache.activities !== activityMessage) {
                        if (channel) {
                            channel.send(activityMessage).catch(err => error(err));
                        }
                        userCache.activities = activityMessage; // Update the cached activities
                    }
                }
            }
        }
    },
};