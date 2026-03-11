import { getSocket } from './socket';

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let isMuted = false;

// ─── GET MICROPHONE ──────────────────────────────────
export async function getLocalStream(): Promise<MediaStream> {
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
export function createPeerConnection(
    callId: string,
    targetId: string,
    onRemoteStream: (stream: MediaStream) => void,
): RTCPeerConnection {
    const socket = getSocket();
    if (!socket) throw new Error('Socket not connected');

    peerConnection = new RTCPeerConnection(STUN_SERVERS);

    // Add local tracks
    localStream?.getTracks().forEach(track => {
        peerConnection!.addTrack(track, localStream!);
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
export async function createOffer(
    callId: string,
    targetId: string,
    onRemoteStream: (stream: MediaStream) => void,
) {
    const socket = getSocket();
    if (!socket) return;

    await getLocalStream();
    const pc = createPeerConnection(callId, targetId, onRemoteStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('webrtc:offer', { callId, offer, targetId });
    console.log('📤 Offer sent to', targetId);
}

// ─── RECEIVER: HANDLE OFFER + CREATE ANSWER ──────────
export async function handleOffer(
    callId: string,
    callerId: string,
    offer: RTCSessionDescriptionInit,
    onRemoteStream: (stream: MediaStream) => void,
) {
    const socket = getSocket();
    if (!socket) return;

    await getLocalStream();
    const pc = createPeerConnection(callId, callerId, onRemoteStream);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc:answer', { callId, answer, targetId: callerId });
    console.log('📤 Answer sent to', callerId);
}

// ─── HANDLE ANSWER ───────────────────────────────────
export async function handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description set');
}

// ─── HANDLE ICE CANDIDATE ────────────────────────────
export async function handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('ICE candidate error:', err);
    }
}

// ─── MUTE / UNMUTE ───────────────────────────────────
export function toggleMute(): boolean {
    if (!localStream) return isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // flip
    });
    isMuted = !isMuted;
    return isMuted;
}

export function getMuteState(): boolean {
    return isMuted;
}

// ─── CLEANUP ─────────────────────────────────────────
export function cleanupWebRTC() {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnection?.close();
    localStream = null;
    peerConnection = null;
    isMuted = false;
    console.log('🧹 WebRTC cleaned up');
}