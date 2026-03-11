import { useEffect } from 'react';
import { router, Slot } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { getToken } from '../src/lib/storage';
import { connectSocket, getSocket } from '../src/lib/socket';
import { registerCallListeners, unregisterCallListeners } from '../src/lib/call';
import { getCallSession } from '../src/lib/callSession';
import { toast } from '../src/lib/toast';
import { registerPushToken, setupNotificationListeners } from '../src/lib/notifications';
import { useRouter } from 'expo-router';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

export default function RootLayout() {

    // ─── INIT SOCKET + CALL LISTENERS ────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                const token = await getToken();
                if (token) {
                    await connectSocket();
                    registerCallListeners();
                }
            } catch (err) {
                console.error('Socket init error:', err);
            }
        };
        init();
        return () => { unregisterCallListeners(); };
    }, []);

    // ─── RELOAD RECOVERY ─────────────────────────────────
    useEffect(() => {
        const recoverCall = async () => {
            if (typeof window === 'undefined') return;

            const token = await getToken();
            if (!token) return;

            const session = getCallSession();
            if (!session) return;

            console.log('🔄 Recovering call session after reload:', session);

            // Reconnect socket
            await connectSocket();
            registerCallListeners();
            await registerPushToken();

            // Wait for socket to connect
            await new Promise(r => setTimeout(r, 1000));

            const socket = getSocket();
            if (!socket) return;

            // Listen for peer-rejoined toast
            socket.on('call:peer-rejoined', ({ name }: any) => {
                toast.info(`${name} reconnected`);
            });

            // Rejoin call room
            socket.emit('call:rejoin', { callId: session.callId });

            // Navigate back to correct screen
            if (session.screen === 'player' && session.trackUrl) {
                router.replace({
                    pathname: '/call/player',
                    params: {
                        callId: session.callId,
                        targetId: session.targetId,
                        name: session.name,
                        isCaller: session.isCaller,
                        trackUrl: session.trackUrl || '',
                        trackTitle: session.trackTitle || '',
                        trackEmoji: session.trackEmoji || '🎵',
                        pickerUserId: session.pickerUserId || '',
                        durationMs: '0',
                        serverTime: '0',
                    },
                });
            } else {
                router.replace({
                    pathname: '/call/pick-song',
                    params: {
                        callId: session.callId,
                        targetId: session.targetId,
                        name: session.name,
                        isCaller: session.isCaller,
                    },
                });
            }
        };

        recoverCall();
    }, []);

    useEffect(() => {
        const cleanup = setupNotificationListeners(({ callId, callerId, callerName }) => {
            // User tapped a push notification for an incoming call
            // The call:incoming socket event handles the UI, but if app was closed
            // we navigate directly to the incoming call screen
            router.push({
                pathname: '/call/incoming',
                params: { callId, callerId, name: callerName },
            });
        });
        return cleanup;
    }, []);

    return (
        <ErrorBoundary>
            <View style={s.shell}>
                <View style={s.phone}>
                    <Slot />
                    <Toast />
                </View>
            </View>
        </ErrorBoundary>
    );
}

const s = StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: '#030308',
        alignItems: 'center',
        justifyContent: 'center',
    },
    phone: {
        flex: 1,
        width: '100%',
        maxWidth: 430,
        backgroundColor: '#070710',
        overflow: 'hidden',
        ...(Platform.OS === 'web' ? {
            maxHeight: '100vh',
            borderWidth: 1.5,
            borderColor: 'rgba(123,110,255,0.25)',
            boxShadow: '0 0 80px rgba(123,110,255,0.12), 0 32px 80px rgba(0,0,0,0.6)',
        } as any : {}),
    },
});