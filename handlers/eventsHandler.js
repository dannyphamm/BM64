const fs = require('fs');

// module.exports = (client) => {
//   fs.readdir("./events/", (err, files) => {
//     if (err) return console.log("Could not find any events!")
//     const jsFiles = files.filter(f => f.split(".").pop() === "js")
//     if (jsFiles.length <= 0) return console.log("Could not find any commands!")
//     jsFiles.forEach(file => {
//         const event = require(`../events/${file}`)
//         console.log(`Loaded ${file}`)
//         client.on(event.name, event.bind(null, client))
//     })
// })
// };
module.exports = (client) => {
  const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(`../events/${file}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}