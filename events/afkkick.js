const { log, error } = require('../utils/utils')
const config = require('../config.json')
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
            const member = newState.member;
            const newChannel = newState.channel;
            const oldChannel = oldState.channel;
            if (newChannel && newChannel.id === '360023189205549075' && newState.channelId !== oldState.channelId) {
                log(`${member.user.tag} entered afk.`)
                const timeout = setTimeout(() => {
                    if (member.voice.channel && member.voice.channel.id === '360023189205549075') {
                        member.voice.setChannel(null);
                        log(`Kicked ${member.user.tag} from AFK channel after 3 hours`);
                    }
                }, 3 * 60 * 60 * 1000);
                member.voice.on('channelLeave', () => {
                    clearTimeout(timeout);
                    log(`${member.user.tag} left the AFK channel.`);
                });
            }
        }
    },
};
