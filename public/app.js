const socket = io();
let localStream = null;
let peerConnection = null;
let isStreaming = false;

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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

// Initialize
if (typeof isAdmin !== 'undefined' && isAdmin) {
    initAdmin();
} else {
    initViewer();
}

function initAdmin() {
    socket.emit('join-as-admin');
    startBtn?.addEventListener('click', startStreaming);
    stopBtn?.addEventListener('click', stopStreaming);
    
    socket.on('viewer-connected', createPeerConnection);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
}

function initViewer() {
    socket.emit('join-as-viewer');
    connectBtn?.addEventListener('click', connectToStream);
    
    socket.on('admin-available', () => {
        updateStatus('Admin available - Click connect');
        connectBtn.disabled = false;
    });
    
    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidate);
}

async function startStreaming() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        isStreaming = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus('Streaming - waiting for viewers');
        
    } catch (error) {
        console.error('Media access error:', error);
        updateStatus('Camera/mic access denied');
    }
}

function stopStreaming() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    localVideo.srcObject = null;
    isStreaming = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('Streaming stopped');
}

async function connectToStream() {
    updateStatus('Connecting...');
    connectBtn.disabled = true;
    socket.emit('request-stream');
}

async function createPeerConnection() {
    if (!isStreaming || !localStream) return;
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { candidate: event.candidate });
        }
    };
    
    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer });
}

async function handleOffer(data) {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        console.log('Track received:', event.track.kind);
        
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            
            // Simple play approach
            remoteVideo.autoplay = true;
            remoteVideo.play().catch(() => {
                // If autoplay fails, make it clickable
                remoteVideo.onclick = () => remoteVideo.play();
                updateStatus('Connected - Click video to play');
            });
            
            updateStatus('Connected successfully');
            disconnectBtn.disabled = false;
        }
    };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { candidate: event.candidate });
        }
    };
    
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer });
}

async function handleAnswer(data) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
    }
}

async function handleIceCandidate(data) {
    if (peerConnection && data.candidate) {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('ICE candidate error:', error);
        }
    }
}

function updateStatus(message) {
    console.log(message);
    if (statusDiv) statusDiv.textContent = message;
    if (streamStatusSpan) streamStatusSpan.textContent = message;
}

// Handle viewer requests on server side
socket.on('request-stream', () => {
    if (isAdmin) {
        socket.emit('viewer-connected');
    }
});
