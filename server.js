const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let adminSocket = null;
const viewers = new Map();

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

io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // ADMIN EVENTS
    socket.on('join-as-admin', () => {
        adminSocket = socket;
        console.log('🔵 Admin joined:', socket.id);
    });

    socket.on('admin-ready', () => {
        console.log('✅ Admin is ready, notifying viewers');
        socket.broadcast.emit('admin-ready');
        
        // Send viewer count to admin
        if (adminSocket) {
            adminSocket.emit('viewer-count', viewers.size);
        }
    });

    socket.on('admin-stopped', () => {
        console.log('⏹️ Admin stopped streaming');
        socket.broadcast.emit('admin-left');
        viewers.clear();
    });

    // VIEWER EVENTS
    socket.on('join-as-viewer', () => {
        viewers.set(socket.id, socket);
        console.log('🟢 Viewer joined:', socket.id, '- Total:', viewers.size);
        
        // If admin is ready, notify this viewer
        if (adminSocket) {
            socket.emit('admin-ready');
        }
    });

    socket.on('viewer-join-stream', () => {
        console.log('🎥 Viewer requesting stream:', socket.id);
        if (adminSocket) {
            adminSocket.emit('new-viewer', {
                viewerId: socket.id
            });
        } else {
            socket.emit('error', { message: 'No admin available' });
        }
    });

    socket.on('viewer-leave-stream', () => {
        console.log('👋 Viewer leaving stream:', socket.id);
        if (adminSocket) {
            adminSocket.emit('viewer-left', {
                viewerId: socket.id
            });
        }
    });

    // SIGNALING EVENTS
    socket.on('offer', (data) => {
        console.log('📤 Relaying offer from', data.from, 'to', data.to);
        socket.to(data.to).emit('offer', data);
    });

    socket.on('answer', (data) => {
        console.log('📥 Relaying answer from', data.from, 'to', data.to);
        socket.to(data.to).emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        console.log('🧊 Relaying ICE candidate from', data.from, 'to', data.to);
        socket.to(data.to).emit('ice-candidate', data);
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        
        if (socket === adminSocket) {
            console.log('🔵 Admin disconnected');
            adminSocket = null;
            socket.broadcast.emit('admin-left');
            viewers.clear();
        } else if (viewers.has(socket.id)) {
            viewers.delete(socket.id);
            console.log('🟢 Viewer disconnected. Remaining:', viewers.size);
            
            if (adminSocket) {
                adminSocket.emit('viewer-left', {
                    viewerId: socket.id
                });
            }
        }
    });
});

const PORT = 3000;
const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📱 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://${localIP}:${PORT}`);
    console.log(`\n📹 Admin: http://${localIP}:${PORT}/admin.html`);
    console.log(`👥 Viewers: http://${localIP}:${PORT}/viewer.html`);
    console.log(`\n✨ Ready for multiple viewers!`);
});
