import { getSocket } from './socket';

const STUN_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

let dynamicIceServers: RTCIceServer[] | null = null;
let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let isMuted = false;
let permissionRequested = false;

// ─── FETCH TURN CREDENTIALS ──────────────────────────
export async function fetchIceServers(): Promise<RTCIceServer[]> {
    if (dynamicIceServers) return dynamicIceServers;
    try {
        const { api } = await import('./api');
        const { data } = await api.get('/turn/credentials');
        dynamicIceServers = data.iceServers;
        console.log('✅ TURN credentials fetched:', dynamicIceServers?.length, 'servers');
        return dynamicIceServers!;
    } catch (err) {
        console.warn('⚠️ Failed to fetch ICE servers, using STUN only:', err);
        return STUN_SERVERS;
    }
}

// ─── MICROPHONE ──────────────────────────────────────
export async function requestMicrophonePermission(): Promise<boolean> {
    if (permissionRequested && localStream) return true;
    try {
        await getLocalStream();
        permissionRequested = true;
        return true;
    } catch {
        return false;
    }
}

export async function getLocalStream(): Promise<MediaStream> {
    if (localStream && localStream.active) return localStream;
    console.log('🎤 Getting microphone stream...');
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
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

    peerConnection = new RTCPeerConnection({
        iceServers: iceServers ?? STUN_SERVERS,
        iceTransportPolicy: 'all',
    });

    localStream?.getTracks().forEach(track => {
        peerConnection!.addTrack(track, localStream!);
    });

    peerConnection.ontrack = (event) => {
        if (event.streams?.[0]) {
            console.log('🔊 Remote stream received, tracks:', event.streams[0].getTracks().length);
            onRemoteStream(event.streams[0]);
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc:ice-candidate', { callId, candidate: event.candidate, targetId });
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

    // Send offer immediately — ICE candidates trickle via onicecandidate
    socket.emit('webrtc:offer', { callId, offer: pc.localDescription, targetId });
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

    if (peerConnection && peerConnection.signalingState !== 'stable') {
        console.warn('⚠️ Ignoring duplicate offer — state:', peerConnection.signalingState);
        return;
    }

    const iceServers = await fetchIceServers();
    await getLocalStream();
    const pc = createPeerConnection(callId, callerId, onRemoteStream, iceServers);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer immediately — ICE candidates trickle via onicecandidate
    socket.emit('webrtc:answer', { callId, answer: pc.localDescription, targetId: callerId });
    console.log('📤 Answer sent to', callerId);
}

// ─── HANDLE ANSWER ───────────────────────────────────
export async function handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!peerConnection) return;
    if (peerConnection.signalingState !== 'have-local-offer') {
        console.warn('⚠️ Ignoring answer — wrong state:', peerConnection.signalingState);
        return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description set');
}

// ─── HANDLE ICE CANDIDATE ────────────────────────────
export async function handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!peerConnection) return;
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
    localStream.getAudioTracks().forEach(track => { track.enabled = isMuted; });
    isMuted = !isMuted;
    return isMuted;
}

export function getMuteState(): boolean { return isMuted; }
export function getPeerConnectionState(): string | null { return peerConnection?.connectionState ?? null; }

export function getLocalDescription(): RTCSessionDescriptionInit | null {
    if (!peerConnection?.localDescription) return null;
    return { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp };
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
