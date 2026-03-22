import { getSocket } from './socket';

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

// Fetched dynamically from server before each call
let dynamicIceServers: RTCIceServer[] | null = null;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
    if (dynamicIceServers) return dynamicIceServers;
    try {
        const { api } = await import('./api');
        const { data } = await api.get('/turn/credentials');
        dynamicIceServers = data.iceServers;
        return dynamicIceServers!;
    } catch (err) {
        console.warn('⚠️ Failed to fetch ICE servers, using STUN only:', err);
        return STUN_SERVERS.iceServers;
    }
}

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let isMuted = false;
let permissionRequested = false;

// ─── REQUEST MICROPHONE EARLY ────────────────────────
export async function requestMicrophonePermission(): Promise<boolean> {
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
    } catch (err) {
        console.error('❌ Microphone permission denied:', err);
        return false;
    }
}

// ─── GET MICROPHONE ──────────────────────────────────
export async function getLocalStream(): Promise<MediaStream> {
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
export function createPeerConnection(
    callId: string,
    targetId: string,
    onRemoteStream: (stream: MediaStream) => void,
    iceServers?: RTCIceServer[],
): RTCPeerConnection {
    const socket = getSocket();
    if (!socket) throw new Error('Socket not connected');

    peerConnection = new RTCPeerConnection({ iceServers: iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }] });

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

    peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', peerConnection?.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log('🧊 ICE gathering:', peerConnection?.iceGatheringState);
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

    const iceServers = await fetchIceServers();
    await getLocalStream();
    const pc = createPeerConnection(callId, targetId, onRemoteStream, iceServers);

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

    // If already have a connection in progress, ignore duplicate offers
    if (peerConnection && peerConnection.signalingState !== 'stable') {
        console.warn('⚠️ Ignoring duplicate offer — signaling state:', peerConnection.signalingState);
        return;
    }

    const iceServers = await fetchIceServers();
    await getLocalStream();
    const pc = createPeerConnection(callId, callerId, onRemoteStream, iceServers);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc:answer', { callId, answer, targetId: callerId });
    console.log('📤 Answer sent to', callerId);
}

// ─── HANDLE ANSWER ───────────────────────────────────
export async function handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!peerConnection) return;
    // Only set remote description if we're in the right state
    if (peerConnection.signalingState !== 'have-local-offer') {
        console.warn('⚠️ Ignoring answer — wrong signaling state:', peerConnection.signalingState);
        return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description set');
}

// ─── HANDLE ICE CANDIDATE ────────────────────────────
export async function handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!peerConnection) return;
    // Drop candidates if connection is already closed or failed
    if (peerConnection.connectionState === 'closed' || peerConnection.connectionState === 'failed') return;
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

export function getPeerConnectionState(): string | null {
    return peerConnection?.connectionState ?? null;
}

export function getLocalDescription(): RTCSessionDescriptionInit | null {
    if (!peerConnection?.localDescription) return null;
    return {
        type: peerConnection.localDescription.type,
        sdp: peerConnection.localDescription.sdp,
    };
}

// ─── CLEANUP ─────────────────────────────────────────
export function cleanupWebRTC() {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnection?.close();
    localStream = null;
    peerConnection = null;
    isMuted = false;
    dynamicIceServers = null;
    console.log('🧹 WebRTC cleaned up');
}