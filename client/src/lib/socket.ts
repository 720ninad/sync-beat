import { io, Socket } from 'socket.io-client';
import { getToken } from './storage';
import Constants from 'expo-constants';

const SERVER_URL = Constants.expoConfig?.extra?.apiUrl?.replace('/api', '') || 'http://localhost:3000';

let socket: Socket | null = null;
// Callback invoked every time the socket (re)connects so listeners can be re-bound
let onReconnectCallback: (() => void) | null = null;

export function setOnReconnect(cb: () => void) {
    onReconnectCallback = cb;
}

export async function connectSocket(): Promise<Socket> {
    if (socket?.connected) return socket;

    const token = await getToken();
    if (!token) throw new Error('No token found');

    socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
        console.log('🟢 Socket connected:', socket?.id);
        // Re-register call listeners after every reconnect
        onReconnectCallback?.();
    });

    socket.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected:', reason);
    });

    socket.on('connect_error', async (err) => {
        console.error('❌ Socket error:', err.message);
        if (err.message === 'Invalid token' || err.message === 'No token provided') {
            const { removeToken } = await import('./storage');
            await removeToken();
            socket?.disconnect();
            socket = null;
        }
    });

    return socket;
}

export function getSocket(): Socket | null {
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('🔴 Socket manually disconnected');
    }
}

export function pingSocket() {
    socket?.emit('presence:ping');
}