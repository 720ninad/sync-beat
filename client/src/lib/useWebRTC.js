"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWebRTC = useWebRTC;
const react_1 = require("react");
const socket_1 = require("./socket");
const webrtc_1 = require("./webrtc");
// ─── GLOBAL STATE — shared across all useWebRTC instances ───
let globalInitialized = false;
let globalIsConnected = false;
let globalIsMuted = false;
let globalRemoteAudio = null;
const listeners = new Set();
function notifyListeners() {
    listeners.forEach(fn => fn());
}
function useWebRTC({ callId, targetId, isCaller }) {
    const [isConnected, setIsConnected] = (0, react_1.useState)(globalIsConnected);
    const [isMuted, setIsMuted] = (0, react_1.useState)(globalIsMuted);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        // Register this component as a listener for global state changes
        const update = () => {
            setIsConnected(globalIsConnected);
            setIsMuted(globalIsMuted);
        };
        listeners.add(update);
        return () => { listeners.delete(update); };
    }, []);
    (0, react_1.useEffect)(() => {
        const socket = (0, socket_1.getSocket)();
        if (!socket || !callId || !targetId) {
            console.warn('useWebRTC — missing socket, callId or targetId');
            return;
        }
        // ✅ Skip if already initialized — prevents double peer connection
        if (globalInitialized) {
            console.log('useWebRTC — already initialized, skipping');
            return;
        }
        globalInitialized = true;
        console.log(`🎙 useWebRTC init — isCaller: ${isCaller}, targetId: ${targetId}`);
        const onRemoteStream = (stream) => {
            console.log('🔊 Remote stream received');
            if (typeof window !== 'undefined') {
                if (!globalRemoteAudio) {
                    globalRemoteAudio = new Audio();
                    globalRemoteAudio.autoplay = true;
                }
                globalRemoteAudio.srcObject = stream;
                globalIsConnected = true;
                notifyListeners();
            }
        };
        const init = async () => {
            try {
                if (isCaller) {
                    setTimeout(async () => {
                        await (0, webrtc_1.createOffer)(callId, targetId, onRemoteStream);
                    }, 1000);
                }
                socket.on('webrtc:offer', async ({ offer, callerId }) => {
                    if (!isCaller) {
                        console.log('📥 Received offer, sending answer...');
                        await (0, webrtc_1.handleOffer)(callId, callerId, offer, onRemoteStream);
                    }
                });
                socket.on('webrtc:answer', async ({ answer }) => {
                    if (isCaller) {
                        console.log('📥 Received answer...');
                        await (0, webrtc_1.handleAnswer)(answer);
                        globalIsConnected = true;
                        notifyListeners();
                    }
                });
                socket.on('webrtc:ice-candidate', async ({ candidate }) => {
                    await (0, webrtc_1.handleIceCandidate)(candidate);
                });
            }
            catch (err) {
                console.error('WebRTC init error:', err);
                setError(err.message || 'Microphone access failed');
            }
        };
        init();
        // ─── CLEANUP only when call fully ends ───────────────
        return () => {
            // Only clean up if this is the last component using WebRTC
            // (i.e. when navigating away from the call entirely)
            if (listeners.size <= 1) {
                socket.off('webrtc:offer');
                socket.off('webrtc:answer');
                socket.off('webrtc:ice-candidate');
                (0, webrtc_1.cleanupWebRTC)();
                if (globalRemoteAudio) {
                    globalRemoteAudio.srcObject = null;
                    globalRemoteAudio = null;
                }
                globalInitialized = false;
                globalIsConnected = false;
                globalIsMuted = false;
                console.log('🧹 WebRTC fully cleaned up');
            }
        };
    }, [callId, targetId, isCaller]);
    const handleToggleMute = () => {
        const muted = (0, webrtc_1.toggleMute)();
        globalIsMuted = muted;
        notifyListeners();
    };
    return { isConnected, isMuted, error, toggleMute: handleToggleMute };
}
