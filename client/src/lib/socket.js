"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectSocket = connectSocket;
exports.getSocket = getSocket;
exports.disconnectSocket = disconnectSocket;
exports.pingSocket = pingSocket;
const socket_io_client_1 = require("socket.io-client");
const storage_1 = require("./storage");
const SERVER_URL = 'http://localhost:3000'; // change to your IP if testing on phone
let socket = null;
async function connectSocket() {
    if (socket?.connected)
        return socket;
    const token = await (0, storage_1.getToken)();
    if (!token)
        throw new Error('No token found');
    socket = (0, socket_io_client_1.io)(SERVER_URL, {
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
function getSocket() {
    return socket;
}
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('🔴 Socket manually disconnected');
    }
}
// Send presence ping via socket (replaces HTTP ping)
function pingSocket() {
    socket?.emit('presence:ping');
}
