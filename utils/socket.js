const { Server } = require('socket.io');
const { createServer } = require('node:http');
const { log } = require('./utils');

let io;

async function connect() {
	if (!io) {
		const host = process.env.SOCKET_HOST || '127.0.0.1';
		const port = Number(process.env.SOCKET_PORT || 3000);
		log(`connecting to socket.io on ${host}:${port}`);
		const httpServer = createServer();
		io = new Server(httpServer);
		await new Promise((resolve) => {
			httpServer.listen(port, host, resolve);
		});
		io.on('connection', (socket) => {
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
