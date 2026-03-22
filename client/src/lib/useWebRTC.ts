import { useState, useEffect } from 'react';
import { getSocket } from './socket';
import {
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleMute,
    cleanupWebRTC,
} from './webrtc';

interface UseWebRTCProps {
    callId: string;
    targetId: string;
    isCaller: boolean;
}

// ─── GLOBAL STATE — shared across all useWebRTC instances ───
let globalInitialized = false;
let globalIsConnected = false;
let globalIsMuted = false;
let globalRemoteAudio: HTMLAudioElement | null = null;
const listeners: Set<() => void> = new Set();

function notifyListeners() {
    listeners.forEach(fn => fn());
}

export function useWebRTC({ callId, targetId, isCaller }: UseWebRTCProps) {
    const [isConnected, setIsConnected] = useState(globalIsConnected);
    const [isMuted, setIsMuted] = useState(globalIsMuted);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Register this component as a listener for global state changes
        const update = () => {
            setIsConnected(globalIsConnected);
            setIsMuted(globalIsMuted);
        };
        listeners.add(update);
        return () => { listeners.delete(update); };
    }, []);

    useEffect(() => {
        const socket = getSocket();
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

        const onRemoteStream = (stream: MediaStream) => {
            console.log('🔊 Remote stream received, tracks:', stream.getTracks().length);
            if (typeof window !== 'undefined') {
                // Remove old audio element if exists
                const existing = document.getElementById('syncbeat-remote-audio') as HTMLAudioElement | null;
                if (existing) {
                    existing.srcObject = null;
                    existing.remove();
                }

                // Create and attach to DOM — required for reliable playback
                const audio = document.createElement('audio');
                audio.id = 'syncbeat-remote-audio';
                audio.autoplay = true;
                audio.muted = false;
                audio.setAttribute('playsinline', 'true');
                audio.style.display = 'none';
                document.body.appendChild(audio);
                globalRemoteAudio = audio;

                audio.srcObject = stream;
                audio.play().catch((err) => {
                    console.warn('⚠️ Audio autoplay blocked, will retry on user interaction:', err);
                    const retry = () => {
                        audio.play().catch(() => { });
                        document.removeEventListener('click', retry);
                        document.removeEventListener('touchstart', retry);
                    };
                    document.addEventListener('click', retry, { once: true });
                    document.addEventListener('touchstart', retry, { once: true });
                });
                globalIsConnected = true;
                notifyListeners();
            }
        };

        const init = async () => {
            try {
                if (isCaller) {
                    // Delay to give receiver time to mount and register listeners
                    setTimeout(async () => {
                        await createOffer(callId, targetId, onRemoteStream);
                    }, 2000);
                } else {
                    // No action needed — offer will arrive after caller's 2s delay
                    console.log('📡 Receiver ready, waiting for offer...');
                }

                socket.on('webrtc:offer', async ({ offer, callerId }: any) => {
                    if (isCaller) return; // caller never handles offers
                    console.log('📥 Received offer, sending answer...');
                    await handleOffer(callId, callerId, offer, onRemoteStream);
                });

                socket.on('webrtc:answer', async ({ answer }: any) => {
                    if (!isCaller) return; // receiver never handles answers
                    console.log('📥 Received answer...');
                    await handleAnswer(answer);
                    globalIsConnected = true;
                    notifyListeners();
                });

                socket.on('webrtc:ice-candidate', async ({ candidate }: any) => {
                    await handleIceCandidate(candidate);
                });

            } catch (err: any) {
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
                cleanupWebRTC();
                if (globalRemoteAudio) {
                    globalRemoteAudio.srcObject = null;
                    globalRemoteAudio.remove();
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
        const muted = toggleMute();
        globalIsMuted = muted;
        notifyListeners();
    };

    return { isConnected, isMuted, error, toggleMute: handleToggleMute };
}