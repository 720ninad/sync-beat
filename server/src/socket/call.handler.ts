import { Server, Socket } from 'socket.io';
import { db } from '../db';
import { callSessions, listenHistory, syncSessions } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { sendPushNotification } from '../lib/push';
import { users } from '../db/schema';
import { getAudioUrl } from '../lib/ytdlp';

export function registerCallHandlers(io: Server, socket: Socket) {
    const caller = socket.data.user;


    // ─── INITIATE CALL ───────────────────────────────────
    socket.on('call:initiate', async ({ receiverId }: { receiverId: string }) => {
        try {
            const [session] = await db
                .insert(callSessions)
                .values({ callerId: caller.id, receiverId, status: 'ringing' })
                .returning();

            socket.join(`call:${session.id}`);
            console.log(`🏠 ${caller.username} joined room call:${session.id}`);

            // Emit to receiver's socket room (works if they're connected)
            io.to(`user:${receiverId}`).emit('call:incoming', {
                callId: session.id, callerId: caller.id,
                name: caller.name, username: caller.username,
            });

            // Push notification to receiver (works if app is backgrounded/closed)
            try {
                const [receiver] = await db.select().from(users).where(eq(users.id, receiverId));
                if (receiver?.pushToken) {
                    await sendPushNotification(
                        receiver.pushToken,
                        `📞 ${caller.name} is calling`,
                        'Tap to answer',
                        { type: 'incoming_call', callId: session.id, callerId: caller.id, callerName: caller.name },
                    );
                }
            } catch (err) {
                console.error('Push on call:initiate error:', err);
            }

            socket.emit('call:initiated', { callId: session.id, receiverId });
            console.log(`📞 ${caller.username} calling ${receiverId}`);

            // Auto-miss after 30 seconds if still ringing
            setTimeout(async () => {
                const [current] = await db.select().from(callSessions).where(eq(callSessions.id, session.id));
                if (current?.status === 'ringing') {
                    await db.update(callSessions)
                        .set({ status: 'missed', endedAt: new Date() })
                        .where(eq(callSessions.id, session.id));
                    io.to(`user:${caller.id}`).emit('call:missed', { callId: session.id });
                    io.to(`user:${receiverId}`).emit('call:missed', { callId: session.id });
                    console.log(`📵 Call ${session.id} missed`);
                }
            }, 30000);

        } catch (err) {
            console.error('call:initiate error:', err);
            socket.emit('call:error', { message: 'Failed to initiate call' });
        }
    });

    // ─── ACCEPT CALL ─────────────────────────────────────
    socket.on('call:accept', async ({ callId }: { callId: string }) => {
        try {
            if (!callId) return;
            const [session] = await db
                .update(callSessions)
                .set({ status: 'active', startedAt: new Date() })
                .where(eq(callSessions.id, callId))
                .returning();

            socket.join(`call:${callId}`);
            console.log(`🏠 ${caller.username} joined room call:${callId}`);

            io.to(`user:${session.callerId}`).emit('call:accepted', {
                callId, receiverId: caller.id,
                name: caller.name, username: caller.username,
            });
            console.log(`✅ Call ${callId} accepted by ${caller.username}`);
        } catch (err) {
            console.error('call:accept error:', err);
            socket.emit('call:error', { message: 'Failed to accept call' });
        }
    });

    // ─── DECLINE CALL ────────────────────────────────────
    socket.on('call:decline', async ({ callId }: { callId: string }) => {
        try {
            if (!callId) return;
            const [session] = await db
                .update(callSessions)
                .set({ status: 'declined', endedAt: new Date() })
                .where(eq(callSessions.id, callId))
                .returning();
            if (!session) return;
            io.to(`user:${session.callerId}`).emit('call:declined', {
                callId, name: caller.name, username: caller.username,
            });
            console.log(`❌ Call ${callId} declined by ${caller.username}`);
        } catch (err) { console.error('call:decline error:', err); }
    });

    // ─── CANCEL CALL ─────────────────────────────────────
    socket.on('call:cancel', async ({ callId }: { callId: string }) => {
        try {
            if (!callId) return;
            const [session] = await db
                .update(callSessions)
                .set({ status: 'missed', endedAt: new Date() })
                .where(eq(callSessions.id, callId))
                .returning();
            if (!session) return;
            io.to(`user:${session.receiverId}`).emit('call:cancelled', {
                callId, callerName: caller.name,
            });
            console.log(`🚫 Call ${callId} cancelled by ${caller.username}`);
        } catch (err) { console.error('call:cancel error:', err); }
    });

    // ─── END CALL ────────────────────────────────────────
    socket.on('call:end', async ({ callId }: { callId: string }) => {
        try {
            if (!callId) return;
            const [session] = await db.select().from(callSessions).where(eq(callSessions.id, callId));
            if (!session) return;



            const durationSecs = session.startedAt
                ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
                : 0;

            await db.update(callSessions)
                .set({ status: 'ended', endedAt: new Date(), durationSecs })
                .where(eq(callSessions.id, callId));

            const otherId = session.callerId === caller.id ? session.receiverId : session.callerId;
            const payload = { callId, durationSecs, endedBy: caller.username };

            if (session.startedAt) {
                try {
                    // Get the last sync session for this call to know what track played
                    const syncData = await db
                        .select()
                        .from(syncSessions)
                        .where(eq(syncSessions.callSessionId, callId))
                        .orderBy(desc(syncSessions.startedAt))
                        .limit(1);

                    if (syncData.length > 0) {
                        const sync = syncData[0];
                        // Save for caller
                        await db.insert(listenHistory).values({
                            userId: session.callerId,
                            trackId: sync.trackId,
                            listenedWithId: session.receiverId,
                            callSessionId: callId,
                            durationSecs,
                        });
                        // Save for receiver
                        await db.insert(listenHistory).values({
                            userId: session.receiverId,
                            trackId: sync.trackId,
                            listenedWithId: session.callerId,
                            callSessionId: callId,
                            durationSecs,
                        });
                    }
                } catch (err) {
                    console.error('listenHistory insert error:', err);
                }
            }

            io.to(`user:${otherId}`).emit('call:ended', payload);
            socket.emit('call:ended', payload);
            socket.leave(`call:${callId}`);
            console.log(`📴 Call ${callId} ended — ${durationSecs}s`);
        } catch (err) { console.error('call:end error:', err); }
    });

    // ─── WEBRTC SIGNALING ────────────────────────────────
    socket.on('webrtc:offer', ({ callId, offer, targetId }: any) => {
        console.log(`📡 WebRTC offer from ${caller.username} → ${targetId}`);
        io.to(`user:${targetId}`).emit('webrtc:offer', { callId, offer, callerId: caller.id });
    });

    // Receiver missed the offer — ask caller to re-send
    socket.on('webrtc:request-offer', ({ callId, targetId }: any) => {
        console.log(`🔁 ${caller.username} requesting offer re-send from ${targetId}`);
        io.to(`user:${targetId}`).emit('webrtc:resend-offer', { callId, requesterId: caller.id });
    });

    socket.on('webrtc:answer', ({ callId, answer, targetId }: any) => {
        console.log(`📡 WebRTC answer from ${caller.username} → ${targetId}`);
        io.to(`user:${targetId}`).emit('webrtc:answer', { callId, answer });
    });

    socket.on('webrtc:ice-candidate', ({ callId, candidate, targetId }: any) => {
        io.to(`user:${targetId}`).emit('webrtc:ice-candidate', { callId, candidate });
    });

    // ─── SYNC: START SONG ────────────────────────────────
    socket.on('sync:start', async ({ callId, trackUrl, trackTitle, trackEmoji, trackId, serverTime, pickerUserId }: any) => {
        const broadcastTime = serverTime || Date.now();

        // Pre-warm YouTube audio URL cache so the receiver's first stream request is fast
        if (trackUrl) {
            const ytMatch = trackUrl.match(/\/stream\/([^/?#]+)/);
            if (ytMatch) {
                getAudioUrl(ytMatch[1]).catch(() => { });
                console.log(`🔥 Pre-warming audio cache for videoId: ${ytMatch[1]}`);
            }
        }

        // Save sync session to DB if we have trackId
        if (trackId && callId) {
            try {
                await db.insert(syncSessions).values({
                    callSessionId: callId,
                    trackId,
                    hostId: caller.id,
                    startedAt: new Date(),
                });
            } catch (err) {
                console.error('syncSession insert error:', err);
            }
        }

        io.to(`call:${callId}`).emit('sync:start', {
            trackUrl, trackTitle, trackEmoji, trackId,
            serverTime: broadcastTime, pickerUserId,
        });
        console.log(`🎵 sync:start broadcast for call ${callId} by ${pickerUserId}`);
    });

    // ─── SYNC: PAUSE ─────────────────────────────────────
    socket.on('sync:pause', ({ callId, positionMs, serverTime }: any) => {
        io.to(`call:${callId}`).emit('sync:pause', {
            positionMs, serverTime: serverTime || Date.now(),
        });
        console.log(`⏸ sync:pause at ${positionMs}ms for call ${callId}`);
    });

    // ─── SYNC: RESUME ────────────────────────────────────
    socket.on('sync:resume', ({ callId, positionMs, serverTime }: any) => {
        io.to(`call:${callId}`).emit('sync:resume', {
            positionMs, serverTime: serverTime || Date.now(),
        });
        console.log(`▶️ sync:resume at ${positionMs}ms for call ${callId}`);
    });

    // ─── SYNC: SEEK ──────────────────────────────────────
    socket.on('sync:seek', ({ callId, positionMs, serverTime }: any) => {
        io.to(`call:${callId}`).emit('sync:seek', {
            positionMs, serverTime: serverTime || Date.now(),
        });
        console.log(`⏩ sync:seek to ${positionMs}ms for call ${callId}`);
    });

    // ─── SYNC: CLOCK PING ────────────────────────────────
    socket.on('sync:ping', ({ clientTime }: any) => {
        socket.emit('sync:pong', { clientTime, serverTime: Date.now() });
    });

    // ─── SYNC: STATE (for reload resync) ─────────────────
    socket.on('sync:state', ({ callId, trackUrl, trackTitle, trackEmoji, positionMs, isPlaying, pickerUserId }: any) => {
        const serverTime = Date.now();
        io.to(`call:${callId}`).emit('sync:state', {
            trackUrl, trackTitle, trackEmoji,
            positionMs, isPlaying, pickerUserId, serverTime,
        });
        console.log(`📡 sync:state broadcast for call ${callId} pos=${positionMs}ms`);
    });

    // ─── REJOIN CALL (after page reload) ─────────────────
    socket.on('call:rejoin', async ({ callId }: { callId: string }) => {
        try {
            const [session] = await db.select().from(callSessions).where(eq(callSessions.id, callId));

            if (!session || session.status !== 'active') {
                socket.emit('call:ended', { callId, durationSecs: 0, endedBy: 'system' });
                return;
            }

            socket.join(`call:${callId}`);
            console.log(`🔄 ${caller.username} rejoined room call:${callId} after reload`);

            const otherId = session.callerId === caller.id ? session.receiverId : session.callerId;

            // Ask other user to send their current playback state
            io.to(`user:${otherId}`).emit('call:request-sync', { callId, requesterId: caller.id });

            // Notify other user that peer reconnected
            io.to(`user:${otherId}`).emit('call:peer-rejoined', { callId, name: caller.name });

        } catch (err) { console.error('call:rejoin error:', err); }
    });


}