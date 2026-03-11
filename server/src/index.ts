import cors from 'cors';
import dotenv from 'dotenv';
import { and, eq, or, sql } from 'drizzle-orm';
import express from 'express';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { db } from './db';
import { friendships } from './db/schema';
import { setUserOffline, setUserOnline } from './lib/redis';
import authRoutes from './routes/auth.routes';
import forgotPasswordRoutes from './routes/forgot-password.routes';
import friendsRoutes from './routes/friends.routes';
import tracksRoutes from './routes/tracks.routes';
import { registerSocketHandlers } from './socket/socket.handler';
import historyRoutes from './routes/history.routes';
import notificationsRoutes from './routes/notifications.routes';
import { authLimiter, generalLimiter, otpLimiter, uploadLimiter } from './middleware/rateLimit';


dotenv.config();
import { env } from './lib/env';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Socket.io setup
export const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Socket auth middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error('No token provided'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.data.user = decoded;
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

// Socket connection handler
io.on('connection', async (socket) => {
    const user = socket.data.user;
    console.log(`🟢 ${user.username} connected (${socket.id})`);

    // Join personal room
    socket.join(`user:${user.id}`);

    // Mark online in Redis
    await setUserOnline(user.id);

    // Notify all accepted friends that this user is online
    const acceptedFriends = await db
        .select()
        .from(friendships)
        .where(
            and(
                eq(friendships.status, 'accepted'),
                or(
                    eq(friendships.senderId, user.id),
                    eq(friendships.receiverId, user.id)
                )
            )
        );

    acceptedFriends.forEach(f => {
        const friendId = f.senderId === user.id ? f.receiverId : f.senderId;
        io.to(`user:${friendId}`).emit('friend:online', { userId: user.id });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        console.log(`🔴 ${user.username} disconnected`);
        await setUserOffline(user.id);

        // Notify friends offline
        acceptedFriends.forEach(f => {
            const friendId = f.senderId === user.id ? f.receiverId : f.senderId;
            io.to(`user:${friendId}`).emit('friend:offline', {
                userId: user.id,
                lastSeenAt: new Date().toISOString(),
            });
        });
    });

    // Register other handlers
    registerSocketHandlers(io, socket);
});

app.use(cors());
app.use(express.json());
app.use(generalLimiter);
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Welcome to SyncBeat API 🎵' });
});

app.get('/health', async (req, res) => {
    try {
        await db.execute(sql`SELECT 1`);
        res.json({ status: 'ok', message: 'SyncBeat server is running 🎵', db: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', db: 'disconnected' });
    }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/forgot-password', otpLimiter, forgotPasswordRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/tracks', uploadLimiter, tracksRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/notifications', notificationsRoutes);

httpServer.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;