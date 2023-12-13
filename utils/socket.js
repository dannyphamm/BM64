const { Server } = require('socket.io');
const { log } = require('./utils');
let io;

async function connect() {
  if (!io) {
    log("connecting to socket.io")
    io = await new Server().listen(3000);
    io.on('connection', async (socket) => {
      log('a user connected');
      socket.on('disconnect', () => {
        log('user disconnected');
      });
    });

  }
  return io;
}

module.exports = {
  socketIO: connect,
};