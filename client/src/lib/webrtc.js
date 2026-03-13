"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestMicrophonePermission = requestMicrophonePermission;
exports.getLocalStream = getLocalStream;
exports.createPeerConnection = createPeerConnection;
exports.createOffer = createOffer;
exports.handleOffer = handleOffer;
exports.handleAnswer = handleAnswer;
exports.handleIceCandidate = handleIceCandidate;
exports.toggleMute = toggleMute;
exports.getMuteState = getMuteState;
exports.cleanupWebRTC = cleanupWebRTC;
const socket_1 = require("./socket");
const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};
let peerConnection = null;
let localStream = null;
let isMuted = false;
let permissionRequested = false;
// ─── REQUEST MICROPHONE EARLY ────────────────────────
async function requestMicrophonePermission() {
    if (permissionRequested && localStream) {
        console.log('🎤 Microphone already granted');
        return true;
    }
    try {
        console.log('🎤 Requesting microphone permission...');
        await getLocalStream();
        permissionRequested = true;
        console.log('✅ Microphone permission granted');
        return true;
    }
    catch (err) {
        console.error('❌ Microphone permission denied:', err);
        return false;
    }
}
// ─── GET MICROPHONE ──────────────────────────────────
async function getLocalStream() {
    // Reuse existing stream if available
    if (localStream && localStream.active) {
        console.log('♻️ Reusing existing microphone stream');
        return localStream;
    }
    console.log('🎤 Getting new microphone stream...');
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
        },
        video: false,
    });
    return localStream;
}
// ─── CREATE PEER CONNECTION ──────────────────────────
function createPeerConnection(callId, targetId, onRemoteStream) {
    const socket = (0, socket_1.getSocket)();
    if (!socket)
        throw new Error('Socket not connected');
    peerConnection = new RTCPeerConnection(STUN_SERVERS);
    // Add local tracks
    localStream?.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    // Receive remote stream
    peerConnection.ontrack = (event) => {
        if (event.streams?.[0]) {
            onRemoteStream(event.streams[0]);
        }
    };
    // Send ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc:ice-candidate', {
                callId,
                candidate: event.candidate,
                targetId,
            });
        }
    };
    peerConnection.onconnectionstatechange = () => {
        console.log('🔗 WebRTC state:', peerConnection?.connectionState);
    };
    return peerConnection;
}
// ─── CALLER: CREATE OFFER ────────────────────────────
async function createOffer(callId, targetId, onRemoteStream) {
    const socket = (0, socket_1.getSocket)();
    if (!socket)
        return;
    await getLocalStream();
    const pc = createPeerConnection(callId, targetId, onRemoteStream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { callId, offer, targetId });
    console.log('📤 Offer sent to', targetId);
}
// ─── RECEIVER: HANDLE OFFER + CREATE ANSWER ──────────
async function handleOffer(callId, callerId, offer, onRemoteStream) {
    const socket = (0, socket_1.getSocket)();
    if (!socket)
        return;
    await getLocalStream();
    const pc = createPeerConnection(callId, callerId, onRemoteStream);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc:answer', { callId, answer, targetId: callerId });
    console.log('📤 Answer sent to', callerId);
}
// ─── HANDLE ANSWER ───────────────────────────────────
async function handleAnswer(answer) {
    if (!peerConnection)
        return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description set');
}
// ─── HANDLE ICE CANDIDATE ────────────────────────────
async function handleIceCandidate(candidate) {
    if (!peerConnection)
        return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
    catch (err) {
        console.error('ICE candidate error:', err);
    }
}
// ─── MUTE / UNMUTE ───────────────────────────────────
function toggleMute() {
    if (!localStream)
        return isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // flip
    });
    isMuted = !isMuted;
    return isMuted;
}
function getMuteState() {
    return isMuted;
}
// ─── CLEANUP ─────────────────────────────────────────
function cleanupWebRTC() {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnection?.close();
    localStream = null;
    peerConnection = null;
    isMuted = false;
    console.log('🧹 WebRTC cleaned up');
}
