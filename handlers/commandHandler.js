const fs = require('fs');

module.exports = (client) => {
  fs.readdir('./commands/', (err, files) => {
    if (err) return console.error(err);
    files.forEach((file) => {
      if (!file.endsWith('.js')) return;
      const props = require(`../commands/${file}`);
      const commandName = file.split('.')[0];
      console.log(`Attempting to load command ${commandName}`);
      client.commands.set(commandName, props);
    });
  });
};
