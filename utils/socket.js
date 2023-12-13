const {Server} = require('socket.io');
const { log } = require('./utils');
let io;

function connect() {
  if (!io) {
    log("connecting to socket.io")
     io = new Server().listen(3000);

    
  }
  return io;
}

module.exports = {
  socketIO: connect,
};