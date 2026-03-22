import { getSocket } from './socket';
import { router } from 'expo-router';

let currentCallId: string | null = null;
let currentTargetId: string | null = null;

export function getCurrentCallId() { return currentCallId; }
export function getCurrentTargetId() { return currentTargetId; }

export function setCurrentCallId(id: string | null) { currentCallId = id; }
export function setCurrentTargetId(id: string | null) { currentTargetId = id; }

// ─── INITIATE ────────────────────────────────────────
export function initiateCall(receiverId: string) {
    const socket = getSocket();
    if (!socket) return;

    currentTargetId = receiverId;

    socket.emit('call:initiate', { receiverId });

    socket.once('call:initiated', ({ callId }: { callId: string }) => {
        currentCallId = callId;
    });
}

// ─── ACCEPT ──────────────────────────────────────────
export function acceptCall(callId: string) {
    const socket = getSocket();
    if (!socket) return;
    currentCallId = callId;
    socket.emit('call:accept', { callId });
}

// ─── DECLINE ─────────────────────────────────────────
export function declineCall(callId: string) {
    const socket = getSocket();
    if (!socket) return;
    if (!callId) { console.warn('declineCall — no callId'); return; }
    currentCallId = null;
    socket.emit('call:decline', { callId });
}

// ─── CANCEL (caller cancels before answer) ───────────
export function cancelCall() {
    const socket = getSocket();
    if (!socket) return;
    if (!currentCallId) { console.warn('cancelCall — no currentCallId'); return; }
    socket.emit('call:cancel', { callId: currentCallId });
    currentCallId = null;
    currentTargetId = null;
}

// ─── END ─────────────────────────────────────────────
export function endCall() {
    const socket = getSocket();
    if (!socket) return;
    if (!currentCallId) { console.warn('endCall — no currentCallId'); return; }
    socket.emit('call:end', { callId: currentCallId });
    currentCallId = null;
    currentTargetId = null;
}

// ─── GET SOCKET (re-export for screens) ──────────────
export { getSocket };

// ─── REGISTER LISTENERS ──────────────────────────────
export function registerCallListeners() {
    const socket = getSocket();
    if (!socket) {
        console.warn('⚠️ registerCallListeners — no socket');
        return;
    }

    console.log('📡 registerCallListeners — binding on socket', socket.id);

    // Receiver: incoming call
    socket.on('call:incoming', ({ callId, callerId, name, username }: any) => {
        console.log('📞 call:incoming received', { callId, callerId, name, username });
        currentCallId = callId;
        try {
            router.push({
                pathname: '/call/incoming',
                params: { callId, callerId, name, username },
            });
            console.log('✅ router.push /call/incoming fired');
        } catch (err) {
            console.error('❌ router.push failed:', err);
        }
    });

    // Caller: receiver accepted → go to pick song
    socket.on('call:accepted', ({ callId, receiverId, name, username }: any) => {
        router.replace({
            pathname: '/call/pick-song',
            params: {
                callId,
                name,
                username,
                isCaller: 'true',
                targetId: receiverId, // the receiver's ID
            },
        });
    });

    // Caller: receiver declined → go home
    socket.on('call:declined', () => {
        currentCallId = null;
        currentTargetId = null;
        router.replace('/(main)/home');
    });

    // Receiver: caller cancelled → dismiss incoming screen
    socket.on('call:cancelled', () => {
        currentCallId = null;
        router.replace('/(main)/home');
    });

    // Either: call ended → go to ended screen
    socket.on('call:ended', ({ callId, durationSecs, endedBy }: any) => {
        currentCallId = null;
        currentTargetId = null;
        router.replace({
            pathname: '/call/ended',
            params: { callId, durationSecs, endedBy },
        });
    });

    // Either: missed
    socket.on('call:missed', () => {
        currentCallId = null;
        currentTargetId = null;
        router.replace('/(main)/home');
    });
}

export function unregisterCallListeners() {
    const socket = getSocket();
    if (!socket) return;
    socket.off('call:incoming');
    socket.off('call:accepted');
    socket.off('call:declined');
    socket.off('call:cancelled');
    socket.off('call:ended');
    socket.off('call:missed');
}