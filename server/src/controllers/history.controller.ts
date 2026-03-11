import { Request, Response } from 'express';
import { db } from '../db';
import { listenHistory, tracks, users, callSessions } from '../db/schema';
import { eq, desc, count, sum, countDistinct, sql } from 'drizzle-orm';

// ─── GET LISTEN HISTORY ──────────────────────────────
export async function getHistory(req: Request, res: Response) {
    try {
        const userId = req.user!.id;

        const rows = await db
            .select({
                id: listenHistory.id,
                durationSecs: listenHistory.durationSecs,
                createdAt: listenHistory.createdAt,
                trackId: tracks.id,
                trackTitle: tracks.title,
                trackArtist: tracks.artist,
                trackDuration: tracks.duration,
                friendId: users.id,
                friendName: users.name,
                friendUsername: users.username,
            })
            .from(listenHistory)
            .leftJoin(tracks, eq(listenHistory.trackId, tracks.id))
            .leftJoin(users, eq(listenHistory.listenedWithId, users.id))
            .where(eq(listenHistory.userId, userId))
            .orderBy(desc(listenHistory.createdAt))
            .limit(50);

        res.json(rows);
    } catch (err) {
        console.error('getHistory error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
}

// ─── GET STATS ───────────────────────────────────────
export async function getStats(req: Request, res: Response) {
    try {
        const userId = req.user!.id;

        // Total calls (ended)
        const [callsRow] = await db
            .select({ total: count() })
            .from(callSessions)
            .where(
                sql`(${callSessions.callerId} = ${userId} OR ${callSessions.receiverId} = ${userId})
                    AND ${callSessions.status} = 'ended'`
            );

        // Total listen time
        const [timeRow] = await db
            .select({ total: sum(listenHistory.durationSecs) })
            .from(listenHistory)
            .where(eq(listenHistory.userId, userId));

        // Unique friends listened with
        const [friendsRow] = await db
            .select({ total: countDistinct(listenHistory.listenedWithId) })
            .from(listenHistory)
            .where(eq(listenHistory.userId, userId));

        // Favorite track (most listened)
        const favRows = await db
            .select({
                trackTitle: tracks.title,
                trackArtist: tracks.artist,
                listenCount: count(),
            })
            .from(listenHistory)
            .leftJoin(tracks, eq(listenHistory.trackId, tracks.id))
            .where(eq(listenHistory.userId, userId))
            .groupBy(tracks.id, tracks.title, tracks.artist)
            .orderBy(desc(count()))
            .limit(1);

        const totalSecs = parseInt(String(timeRow?.total || 0));
        const totalHours = Math.floor(totalSecs / 3600);
        const totalMins = Math.floor((totalSecs % 3600) / 60);

        res.json({
            totalCalls: callsRow?.total || 0,
            totalListenSecs: totalSecs,
            totalListenLabel: totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`,
            uniqueFriends: friendsRow?.total || 0,
            favoriteTrack: favRows[0] || null,
        });
    } catch (err) {
        console.error('getStats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}