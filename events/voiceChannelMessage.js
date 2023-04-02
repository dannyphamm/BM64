
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;

        if (newChannel && newChannel.members.size === 1) { // channel is empty except the user
            const channelMessage = await newChannel.send('All messages sent in this text channel will automatically disappear after 15 minutes.');
            channelMessage.channelId = newChannel.id; // save the channel ID on the message
        }

        if (oldChannel && oldChannel.members.size === 0) { // channel became empty
            const channelId = oldChannel.id;
            const fetchedMessages = await oldChannel.messages.fetch();
            const channelMessage = fetchedMessages.find(msg => msg.channelId === channelId);

            if (channelMessage) {
                channelMessage.delete();
            }
        }
    },
};

