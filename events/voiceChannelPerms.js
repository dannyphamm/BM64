
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const member = newState.member;
        const newChannel = newState.channel;
        const oldChannel = oldState.channel;
        if (newChannel && newChannel.type === 2) {
            const textChannel = newChannel.parent?.children.cache.find(c => c.type === 2 && c.id === newChannel.id);
            if (textChannel && member) {
                textChannel.permissionOverwrites.edit(member, {
                    ReadMessageHistory: true,
                    SendMessages: true
                }).then(() => {
                    console.log(`Added permissions for ${member.user.tag} in ${textChannel.name} (${textChannel.id})`);
                }).catch(console.error);
            }
        }

        if (oldChannel && oldChannel.type === 2) {
            const textChannel = oldChannel.parent?.children.cache.find(c => c.type === 2 && c.id === oldChannel.id);

            if (textChannel && member) {
                textChannel.permissionOverwrites.delete(member, {
                
                    SendMessages: false
                }).then(() => {
                    console.log(`Removed permissions for ${member.user.tag} in ${textChannel.name} (${textChannel.id})`);
                }).catch(console.error);
            }
        }
    },
};

