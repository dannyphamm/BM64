const {log} = require('../utils/utils')
const config = require('../config.json')
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        if (config.mode !== 'DEV') {
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;

            // Check if the user has joined an empty channel
            if (newChannel && newChannel.members.size === 1 && newState.channelId !== oldState.channelId) {
                log(`Session Created in ${newChannel.name} (${newChannel.id})`)
                const channelMessage = await newChannel.send('All messages sent in this text channel will automatically disappear after 15 minutes.');
                channelMessage.channelId = newChannel.id; // save the channel ID on the message
            }

            // Check if the user has left an empty channel
            if (oldChannel && oldChannel.members.size === 0) {
                log(`Session complete in ${oldChannel.name} (${oldChannel.id}). Deleting message`)
                const fetchedMessages = await oldChannel.messages.fetch();
                const firstMessage = fetchedMessages.last();
                firstMessage.delete();
            }
        }
    },
};