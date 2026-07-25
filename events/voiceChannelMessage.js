const { log, error } = require('../utils/utils');
const config = require('../config.json');

const SESSION_NOTICE = 'All messages sent in this text channel will automatically disappear after 15 minutes.';

module.exports = {
	name: 'voiceStateUpdate',
	async execute(oldState, newState) {
		if (config.mode === 'DEV') return;

		const misamoChannelId = config.misamoVoiceChannel;
		const oldChannel = oldState.channel;
		const newChannel = newState.channel;

		// User joined an empty channel (session start)
		if (newChannel && newChannel.members.size === 1 && newState.channelId !== oldState.channelId && newState.channelId !== misamoChannelId) {
			log(`Session Created in ${newChannel.name} (${newChannel.id})`);
			await newChannel.send(SESSION_NOTICE).catch((e) => error(e, 'VOICE_SESSION_NOTICE'));
		}

		// Last user left — remove the session notice if present
		if (oldChannel && oldChannel.members.size === 0 && oldChannel.id !== misamoChannelId) {
			log(`Session complete in ${oldChannel.name} (${oldChannel.id}). Deleting message`);
			try {
				const fetchedMessages = await oldChannel.messages.fetch({ limit: 20 });
				const notice = fetchedMessages.find((m) => m.content === SESSION_NOTICE && m.author.id === oldState.client.user.id);
				if (notice) {
					await notice.delete();
				}
			} catch (e) {
				error(e, 'VOICE_SESSION_CLEANUP');
			}
		}
	},
};
