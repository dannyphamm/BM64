const config = require('../config.json');
const { error } = require('../utils/utils');

const SESSION_NOTICE = 'All messages sent in this text channel will automatically disappear after 15 minutes.';

module.exports = {
	name: 'messageCreate',
	async execute(message) {
		if (config.mode === 'DEV') return;
		// GuildVoice = text-in-voice
		if (message.channel.type !== 2) return;
		if (message.content === SESSION_NOTICE) return;
		if (message.embeds.length > 0 && message.author.id === message.client.user.id) return;

		setTimeout(() => {
			message.delete().catch((e) => error(e, 'VOICE_MSG_AUTODELETE'));
		}, 900000);
	},
};
