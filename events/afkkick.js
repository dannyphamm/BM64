const { log, error } = require('../utils/utils')
const config = require('../config.json')

// Store timeouts in a Map for easy access
const afkTimeouts = new Map()

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
            const member = newState.member;
            const newChannel = newState.channel;
            const oldChannel = oldState.channel;

            // Check if the member entered the AFK channel
            if (newChannel && newChannel.id === '360023189205549075' && newState.channelId !== oldState.channelId) {
                log(`${member.user.tag} entered afk.`);

                // Create a timeout for kicking the member after 3 hours
                const timeout = setTimeout(() => {
                    if (member.voice.channel && member.voice.channel.id === '360023189205549075') {
                        member.voice.setChannel(null);
                        log(`Kicked ${member.user.tag} from AFK channel after 3 hours`);
                        afkTimeouts.delete(member.id); // Clean up the timeout entry
                    }
                }, 3 * 60 * 60 * 1000);

                // Store the timeout in the Map
                afkTimeouts.set(member.id, timeout);
            }

            // Check if the member leaves the AFK channel
            if (oldChannel && oldChannel.id === '360023189205549075' && newState.channelId !== '360023189205549075') {
                // Member has left the AFK channel, clear the timeout
                const timeout = afkTimeouts.get(member.id);
                if (timeout) {
                    clearTimeout(timeout);
                    afkTimeouts.delete(member.id); // Clean up the timeout entry
                    log(`${member.user.tag} left the AFK channel.`);
                }
            }
        }
    },
};
