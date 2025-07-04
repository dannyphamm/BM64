const { log, error } = require('../utils/utils')
const config = require('../config.json')
const schedule = require('node-schedule')

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
            return;
        }

        let summaryMessage = '📊 **Daily Gaming Summary**\n\n';
        
        // Convert games map to array and sort by total duration
        const gamesArray = Array.from(dailyGameStats.games.entries()).map(([gameName, stats]) => ({
            name: gameName,
            totalDuration: stats.totalDuration,
            sessions: stats.sessions
        })).sort((a, b) => b.totalDuration - a.totalDuration);

        for (const game of gamesArray) {
            const hours = Math.floor(game.totalDuration / (1000 * 60 * 60));
            const minutes = Math.floor((game.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            
            summaryMessage += `🎮 **${game.name}**\n`;
            summaryMessage += `⏱️ Total time: ${timeStr}\n`;
            summaryMessage += `📈 Sessions: ${game.sessions}\n\n`;
        }

        await channel.send(summaryMessage);
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
    } else {
        // Ending a game session
        if (dailyGameStats.games.has(gameName)) {
            const gameStats = dailyGameStats.games.get(gameName);
            if (gameStats.startTime) {
                const sessionDuration = now - gameStats.startTime;
                // Only add positive duration (in case of clock issues)
                if (sessionDuration > 0) {
                    gameStats.totalDuration += sessionDuration;
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
                    console.log(statusMessage);
                    
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
                    
                    let activityMessage;

                    if (activities.length > 0) {
                        activityMessage = activities.map(activity => {
                            if (activity.type === 2) {
                                return `${newState.user.tag} is listening to ${activity.name} + ${activity.details} + ${activity.state}`;
                            } else if (activity.type === 0) {
                                // Track game activity
                                const gameName = activity.name;
                                const wasPlaying = oldActivities.some(oldActivity => 
                                    oldActivity.type === 0 && oldActivity.name === gameName
                                );
                                
                                if (!wasPlaying) {
                                    // Started playing this game
                                    updateGameStats(gameName, true);
                                }
                                
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
                        // No activities - check if we need to end any ongoing game sessions
                        if (oldActivities.length > 0) {
                            oldActivities.forEach(oldActivity => {
                                if (oldActivity.type === 0) {
                                    updateGameStats(oldActivity.name, false);
                                }
                            });
                        }
                        
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