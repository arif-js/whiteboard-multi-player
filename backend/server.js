const { Hocuspocus } = require('@hocuspocus/server');

const server = new Hocuspocus({
  port: 1234,
  // Middleware for auth, persistence, or logging
  async onConnect() {
    console.log('New peer connected');
  },
  async onDisconnect() {
    console.log('Peer disconnected');
  }
});

server.listen();
console.log('Hocuspocus Sync Server running on port 1234');