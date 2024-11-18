const { log, error } = require('../utils/utils')
const config = require('../config.json')
// Cache to store the last known status and activities
const userCache = {
    status: null,
    activities: null,
};

module.exports = {
    name: 'presenceUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
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