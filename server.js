const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

let adminSocket = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-as-admin', () => {
        adminSocket = socket;
        console.log('Admin joined');
        socket.broadcast.emit('admin-available');
    });

    socket.on('join-as-viewer', () => {
        console.log('Viewer joined');
        if (adminSocket) {
            socket.emit('admin-available');
        }
    });

    socket.on('request-stream', () => {
        if (adminSocket) {
            adminSocket.emit('viewer-connected');
        }
    });

    socket.on('offer', (data) => {
        socket.broadcast.emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.broadcast.emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        if (socket === adminSocket) {
            adminSocket = null;
        }
    });
});

const PORT = 3000;
const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📱 Local access: http://localhost:${PORT}`);
    console.log(`🌐 Network access: http://${localIP}:${PORT}`);
    console.log(`\n📹 Admin (Streamer): http://${localIP}:${PORT}/admin.html`);
    console.log(`👥 Viewer: http://${localIP}:${PORT}/viewer.html`);
    console.log(`\nShare the network URL with others on your WiFi network!`);
});
