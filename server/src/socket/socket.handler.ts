import { Server, Socket } from 'socket.io';
import { registerCallHandlers } from './call.handler';


export function registerSocketHandlers(io: Server, socket: Socket) {
    const user = socket.data.user;

    // Ping — keep presence alive
    socket.on('presence:ping', async () => {
        const { setUserOnline } = await import('../lib/redis');
        await setUserOnline(user.id);
    });

    // Register call handlers
    registerCallHandlers(io, socket);

    socket.on('error', (err) => {
        console.error(`Socket error from ${user.username}:`, err);
    });
}