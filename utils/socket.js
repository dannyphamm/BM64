const {Server} = require('socket.io');

let io;

function connect() {
  if (!io) {
     io = new Server({});
    
  }
  return io;
}

module.exports = {
  socketIO: connect,
};