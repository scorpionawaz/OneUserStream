const socket = io();
let localStream = null;
let peerConnections = new Map();
let isStreaming = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Free public TURN servers (fixes cross-network issues)
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        },
        {
            urls: 'turn:192.158.29.39:3478?transport=udp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
        }
    ]
};


// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusDiv = document.getElementById('status');
const streamStatusSpan = document.getElementById('streamStatus');
const viewerCountDiv = document.getElementById('viewerCount');

// Initialize
if (typeof isAdmin !== 'undefined' && isAdmin) {
    initAdmin();
} else {
    initViewer();
}

function initAdmin() {
    console.log('🔵 Admin: Initializing');
    socket.emit('join-as-admin');
    
    startBtn?.addEventListener('click', startStreaming);
    stopBtn?.addEventListener('click', stopStreaming);
    
    // Admin event listeners
    socket.on('new-viewer', handleNewViewer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('viewer-left', handleViewerLeft);
}

function initViewer() {
    console.log('🟢 Viewer: Initializing');
    socket.emit('join-as-viewer');
    
    connectBtn?.addEventListener('click', connectToStream);
    disconnectBtn?.addEventListener('click', disconnectFromStream);
    
    // Viewer event listeners
    socket.on('admin-ready', () => {
        console.log('✅ Admin is ready for viewers');
        updateStatus('Admin is streaming - Click to connect');
        if (connectBtn) connectBtn.disabled = false;
    });
    
    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidate);
    
    socket.on('admin-left', () => {
        updateStatus('Admin disconnected');
        if (remoteVideo) remoteVideo.srcObject = null;
        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = true;
    });
}

// ADMIN FUNCTIONS
async function startStreaming() {
    console.log('🔵 Admin: Starting stream...');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
        });
        
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        
        isStreaming = true;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        updateStatus('🔴 LIVE - Waiting for viewers...');
        
        // Tell server we're ready for viewers
        socket.emit('admin-ready');
        
    } catch (error) {
        console.error('❌ Media access error:', error);
        updateStatus('❌ Camera/microphone access denied');
    }
}

function stopStreaming() {
    console.log('🔵 Admin: Stopping stream...');
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Close all peer connections
    peerConnections.forEach((pc, viewerId) => {
        console.log('🔵 Admin: Closing connection to:', viewerId);
        pc.close();
    });
    peerConnections.clear();
    
    if (localVideo) localVideo.srcObject = null;
    
    isStreaming = false;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    updateStatus('⏹️ Streaming stopped');
    updateViewerCount(0);
    
    socket.emit('admin-stopped');
}

async function handleNewViewer(data) {
    console.log('🔵 Admin: New viewer requesting connection:', data.viewerId);
    
    if (!isStreaming || !localStream) {
        console.log('❌ Not streaming, ignoring viewer request');
        return;
    }
    
    try {
        // Create peer connection for this viewer
        const pc = new RTCPeerConnection(configuration);
        peerConnections.set(data.viewerId, pc);
        
        console.log('✅ Admin: Created peer connection for viewer:', data.viewerId);
        
        // Add tracks immediately
        localStream.getTracks().forEach(track => {
            console.log('➕ Adding track:', track.kind);
            pc.addTrack(track, localStream);
        });
        
        // Set up event handlers
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 Admin: Sending ICE candidate to:', data.viewerId);
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    to: data.viewerId,
                    from: socket.id
                });
            }
        };
        
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`🔵 Connection state for ${data.viewerId}:`, state);
            
            if (state === 'connected') {
                console.log('✅ Successfully connected to viewer:', data.viewerId);
                updateViewerCount(peerConnections.size);
            } else if (state === 'disconnected' || state === 'failed') {
                console.log('❌ Viewer disconnected:', data.viewerId);
                peerConnections.delete(data.viewerId);
                updateViewerCount(peerConnections.size);
            }
        };
        
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        console.log('📤 Admin: Sending offer to viewer:', data.viewerId);
        socket.emit('offer', {
            offer: offer,
            to: data.viewerId,
            from: socket.id
        });
        
    } catch (error) {
        console.error('❌ Admin: Error handling new viewer:', error);
    }
}

async function handleAnswer(data) {
    console.log('📥 Admin: Received answer from viewer:', data.from);
    
    const pc = peerConnections.get(data.from);
    if (pc) {
        try {
            await pc.setRemoteDescription(data.answer);
            console.log('✅ Admin: Set remote description for viewer:', data.from);
        } catch (error) {
            console.error('❌ Admin: Error setting remote description:', error);
        }
    } else {
        console.error('❌ Admin: No peer connection found for viewer:', data.from);
    }
}

function handleViewerLeft(data) {
    console.log('👋 Admin: Viewer left:', data.viewerId);
    const pc = peerConnections.get(data.viewerId);
    if (pc) {
        pc.close();
        peerConnections.delete(data.viewerId);
        updateViewerCount(peerConnections.size);
    }
}

// VIEWER FUNCTIONS
async function connectToStream() {
    console.log('🟢 Viewer: Requesting stream...');
    updateStatus('🔄 Connecting to stream...');
    if (connectBtn) connectBtn.disabled = true;
    
    socket.emit('viewer-join-stream');
}

function disconnectFromStream() {
    console.log('🟢 Viewer: Disconnecting...');
    
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    
    if (remoteVideo) remoteVideo.srcObject = null;
    
    if (connectBtn) connectBtn.disabled = false;
    if (disconnectBtn) disconnectBtn.disabled = true;
    updateStatus('Disconnected');
    updateStreamStatus('Disconnected');
    
    socket.emit('viewer-leave-stream');
}

async function handleOffer(data) {
    console.log('📥 Viewer: Received offer from admin');
    
    try {
        const pc = new RTCPeerConnection(configuration);
        peerConnections.set('admin', pc);
        
        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log('🎥 Viewer: Received track:', event.track.kind);
            
            if (remoteVideo && event.streams[0]) {
                console.log('📺 Viewer: Setting video source');
                remoteVideo.srcObject = event.streams[0];
                
                // Simple autoplay
                setTimeout(() => {
                    remoteVideo.play().then(() => {
                        console.log('▶️ Video playing successfully');
                        updateStatus('✅ Connected - Live Stream');
                        updateStreamStatus('🔴 LIVE');
                        if (disconnectBtn) disconnectBtn.disabled = false;
                    }).catch(error => {
                        console.log('⚠️ Autoplay blocked, enabling click to play');
                        updateStatus('✅ Connected - Click video to play');
                        updateStreamStatus('Click to play');
                        
                        remoteVideo.onclick = () => {
                            remoteVideo.play();
                            updateStreamStatus('🔴 LIVE');
                            remoteVideo.onclick = null;
                        };
                    });
                }, 100);
            }
        };
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 Viewer: Sending ICE candidate to admin');
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    to: data.from,
                    from: socket.id
                });
            }
        };
        
        pc.onconnectionstatechange = () => {
            console.log('🟢 Viewer: Connection state:', pc.connectionState);
        };
        
        // Set remote description and create answer
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        console.log('📤 Viewer: Sending answer to admin');
        socket.emit('answer', {
            answer: answer,
            to: data.from,
            from: socket.id
        });
        
    } catch (error) {
        console.error('❌ Viewer: Error handling offer:', error);
        updateStatus('❌ Connection failed');
    }
}

// SHARED FUNCTIONS
async function handleIceCandidate(data) {
    console.log('🧊 Received ICE candidate from:', data.from);
    
    let pc;
    if (isAdmin) {
        pc = peerConnections.get(data.from);
    } else {
        pc = peerConnections.get('admin');
    }
    
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(data.candidate);
            console.log('✅ ICE candidate added successfully');
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    } else {
        console.warn('⚠️ No peer connection found for ICE candidate');
    }
}

function updateViewerCount(count) {
    console.log('👥 Viewer count:', count);
    if (viewerCountDiv) {
        viewerCountDiv.textContent = `👥 Connected Viewers: ${count}`;
    }
}

function updateStatus(message) {
    console.log('📢 Status:', message);
    if (statusDiv) statusDiv.textContent = message;
}

function updateStreamStatus(status) {
    console.log('📡 Stream Status:', status);
    if (streamStatusSpan) streamStatusSpan.textContent = status;
}
