import { Server, Socket } from 'socket.io';
import { registerCallHandlers } from './call.handler';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';


export function registerSocketHandlers(io: Server, socket: Socket) {
    const user = socket.data.user;

    // Ping — keep presence alive and update lastSeenAt
    socket.on('presence:ping', async () => {
        const { setUserOnline } = await import('../lib/redis');
        await setUserOnline(user.id);
        // Update lastSeenAt so offline friends see accurate "last seen" time
        try {
            await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
        } catch { }
    });

    // Register call handlers
    registerCallHandlers(io, socket);

    socket.on('error', (err) => {
        console.error(`Socket error from ${user.username}:`, err);
    });
}