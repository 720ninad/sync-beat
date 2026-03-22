import { useEffect } from 'react';
import { router, Slot, usePathname } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { getToken } from '../src/lib/storage';
import { connectSocket, disconnectSocket, getSocket, setOnReconnect, pingSocket } from '../src/lib/socket';
import { registerCallListeners, unregisterCallListeners } from '../src/lib/call';
import { getCallSession } from '../src/lib/callSession';
import { toast } from '../src/lib/toast';
import { setupNotificationListeners } from '../src/lib/notifications';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

// Routes that should NOT have an active socket connection
const UNAUTH_ROUTES = ['/', '/login', '/signup', '/forgot-password'];

export default function RootLayout() {
    const pathname = usePathname();

    // ─── DISCONNECT SOCKET ON UNAUTH ROUTES ──────────────
    // Prevents ghost "online" status when a new tab opens on login page
    useEffect(() => {
        if (UNAUTH_ROUTES.includes(pathname)) {
            disconnectSocket();
        }
    }, [pathname]);

    // ─── INIT SOCKET + CALL LISTENERS ────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                const token = await getToken();
                if (!token) return;

                // Don't connect socket on unauthenticated routes
                if (UNAUTH_ROUTES.includes(pathname)) return;

                // setOnReconnect fires on EVERY connect event — including the first one.
                // So we register listeners here only, not eagerly after connectSocket().
                setOnReconnect(() => {
                    unregisterCallListeners();
                    registerCallListeners();
                    pingSocket();
                });
                // Just initiate the connection — listeners bind when 'connect' fires above
                await connectSocket();
            } catch (err: any) {
                console.error('Socket init error:', err);
                if (err.message === 'Invalid token' || err.message === 'No token found') {
                    router.replace('/login');
                }
            }
        };
        init();
        return () => { unregisterCallListeners(); };
    }, [pathname]);

    // ─── GLOBAL PRESENCE PING (keeps Redis TTL alive on all screens) ─────
    useEffect(() => {
        if (UNAUTH_ROUTES.includes(pathname)) return;
        const interval = setInterval(pingSocket, 25000);
        return () => clearInterval(interval);
    }, [pathname]);

    // ─── RELOAD RECOVERY ─────────────────────────────────
    useEffect(() => {
        const recoverCall = async () => {
            // Only recover if there's an active call session saved
            const session = getCallSession();
            if (!session) return;

            const token = await getToken();
            if (!token) return;

            console.log('🔄 Recovering call session after reload:', session);

            // Wait for the socket init from the first useEffect to complete
            await new Promise(r => setTimeout(r, 1500));

            const socket = getSocket();
            if (!socket) return;

            socket.on('call:peer-rejoined', ({ name }: any) => {
                toast.info(`${name} reconnected`);
            });

            socket.emit('call:rejoin', { callId: session.callId });

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