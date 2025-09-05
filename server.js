const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

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

    // Simple message relay
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

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
