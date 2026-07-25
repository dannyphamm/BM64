const { ChannelType } = require('discord.js');
const { log, error } = require('../utils/utils');
const config = require('../config.json');

module.exports = {
	name: 'voiceStateUpdate',
	async execute(oldState, newState) {
		if (config.mode === 'DEV') return;

		const member = newState.member;
		const newChannel = newState.channel;
		const oldChannel = oldState.channel;

		// Text-in-voice: grant send/history on the voice channel itself
		if (newChannel && newChannel.type === ChannelType.GuildVoice && newState.channelId !== oldState.channelId && member) {
			newChannel.permissionOverwrites.edit(member, {
				ReadMessageHistory: true,
				SendMessages: true,
			}).then(() => {
				log(`Added permissions for ${member.user.tag} in ${newChannel.name} (${newChannel.id})`);
			}).catch(error);
		}

		if (oldChannel && oldChannel.type === ChannelType.GuildVoice && newState.channelId !== oldState.channelId && member) {
			oldChannel.permissionOverwrites.delete(member).then(() => {
				log(`Removed permissions for ${member.user.tag} in ${oldChannel.name} (${oldChannel.id})`);
			}).catch(error);
		}
	},
};
