import { io, Socket } from 'socket.io-client';
import { getToken } from './storage';

const SERVER_URL = 'http://localhost:3000'; // change to your IP if testing on phone

let socket: Socket | null = null;

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
    });

    socket.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.error('❌ Socket error:', err.message);
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

// Send presence ping via socket (replaces HTTP ping)
export function pingSocket() {
    socket?.emit('presence:ping');
}