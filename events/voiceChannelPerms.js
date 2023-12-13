const { log, error } = require('../utils/utils')
const config = require('../config.json')
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
            const member = newState.member;
            const newChannel = newState.channel;
            const oldChannel = oldState.channel;
            if (newChannel && newChannel.type === 2 && newState.channelId !== oldState.channelId) {
                const textChannel = newChannel.parent?.children.cache.find(c => c.type === 2 && c.id === newChannel.id);
                if (textChannel && member) {
                    textChannel.permissionOverwrites.edit(member, {
                        ReadMessageHistory: true,
                        SendMessages: true
                    }).then(() => {
                        log(`Added permissions for ${member.user.tag} in ${textChannel.name} (${textChannel.id})`)
                    }).catch(error);
                }
            }

            if (oldChannel && oldChannel.type === 2 && newState.channelId !== oldState.channelId) {
                const textChannel = oldChannel.parent?.children.cache.find(c => c.type === 2 && c.id === oldChannel.id);
                if (textChannel && member) {
                    textChannel.permissionOverwrites.delete(member, {
                    }).then(() => {
                        log(`Removed permissions for ${member.user.tag} in ${textChannel.name} (${textChannel.id})`);
                    }).catch(error);
                }
            }
        }

    },
};

