const { clientId, token, guildId } = require('./config.json');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

function getCommands(dir) {
	const commands = [];
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.lstatSync(filePath);

		if (stat.isDirectory()) {
			commands.push(...getCommands(filePath));
		} else if (file.endsWith('.js')) {
			const command = require(filePath);
			commands.push(command.data.toJSON());
		}
	}

	return commands;
}

const commandsPath = path.join(__dirname, 'commands');
const commands = getCommands(commandsPath);
// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
