import { Request, Response } from 'express';
import { db } from '../db';
import { users, friendships } from '../db/schema';
import { eq, or, and, ilike, ne, sql } from 'drizzle-orm';
import { setUserOnline, setUserOffline, getOnlineFriends } from '../lib/redis';

// ─────────────────────────────────────────────────────
// SEARCH USERS BY USERNAME
// GET /api/friends/search?query=alex
// ─────────────────────────────────────────────────────
export async function searchUsers(req: Request, res: Response) {
    try {
        const query = (req.query.query as string || '').trim();

        if (!query || query.length < 2) {
            res.status(400).json({ error: 'Search query must be at least 2 characters' });
            return;
        }

        const results = await db
            .select({
                id: users.id,
                name: users.name,
                username: users.username,
                bio: users.bio,
            })
            .from(users)
            .where(
                and(
                    ilike(users.username, `%${query}%`),
                    ne(users.id, req.user!.id)
                )
            )
            .limit(10);

        if (results.length === 0) {
            res.json([]);
            return;
        }

        const enriched = await Promise.all(
            results.map(async (user) => {
                const [existing] = await db
                    .select()
                    .from(friendships)
                    .where(
                        or(
                            and(
                                eq(friendships.senderId, req.user!.id),
                                eq(friendships.receiverId, user.id)
                            ),
                            and(
                                eq(friendships.senderId, user.id),
                                eq(friendships.receiverId, req.user!.id)
                            )
                        )
                    )
                    .limit(1);

                return {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    bio: user.bio,
                    friendshipId: existing?.id ?? null,
                    friendshipStatus: existing?.status ?? null,
                    isSender: existing?.senderId === req.user!.id,
                };
            })
        );

        res.json(enriched);
    } catch (error) {
        console.error('[searchUsers]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// SEND FRIEND REQUEST
// POST /api/friends/request
// body: { username: string }
// ─────────────────────────────────────────────────────
export async function sendFriendRequest(req: Request, res: Response) {
    try {
        const { username } = req.body;

        if (!username || typeof username !== 'string') {
            res.status(400).json({ error: 'Username is required' });
            return;
        }

        const [target] = await db
            .select()
            .from(users)
            .where(eq(users.username, username.trim().toLowerCase()))
            .limit(1);

        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (target.id === req.user!.id) {
            res.status(400).json({ error: 'You cannot send a friend request to yourself' });
            return;
        }

        const [existing] = await db
            .select()
            .from(friendships)
            .where(
                or(
                    and(
                        eq(friendships.senderId, req.user!.id),
                        eq(friendships.receiverId, target.id)
                    ),
                    and(
                        eq(friendships.senderId, target.id),
                        eq(friendships.receiverId, req.user!.id)
                    )
                )
            )
            .limit(1);

        if (existing) {
            if (existing.status === 'accepted') {
                res.status(400).json({ error: 'You are already friends with this user' });
                return;
            }
            if (existing.status === 'pending') {
                res.status(400).json({ error: 'A friend request is already pending' });
                return;
            }
            if (existing.status === 'declined') {
                // Re-send after decline
                const [updated] = await db
                    .update(friendships)
                    .set({
                        senderId: req.user!.id,
                        receiverId: target.id,
                        status: 'pending',
                        updatedAt: new Date(),
                    })
                    .where(eq(friendships.id, existing.id))
                    .returning();

                res.status(201).json({
                    message: 'Friend request sent',
                    friendship: updated,
                    user: {
                        id: target.id,
                        name: target.name,
                        username: target.username,
                    },
                });
                return;
            }
        }

        const [friendship] = await db
            .insert(friendships)
            .values({
                senderId: req.user!.id,
                receiverId: target.id,
                status: 'pending',
            })
            .returning();

        res.status(201).json({
            message: 'Friend request sent',
            friendship,
            user: {
                id: target.id,
                name: target.name,
                username: target.username,
            },
        });
    } catch (error) {
        console.error('[sendFriendRequest]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// GET INCOMING FRIEND REQUESTS
// GET /api/friends/requests
// ─────────────────────────────────────────────────────
export async function getFriendRequests(req: Request, res: Response) {
    try {
        const requests = await db
            .select({
                id: friendships.id,
                status: friendships.status,
                createdAt: friendships.createdAt,
                sender: {
                    id: users.id,
                    name: users.name,
                    username: users.username,
                    bio: users.bio,
                },
            })
            .from(friendships)
            .innerJoin(users, eq(users.id, friendships.senderId))
            .where(
                and(
                    eq(friendships.receiverId, req.user!.id),
                    eq(friendships.status, 'pending')
                )
            )
            .orderBy(friendships.createdAt);

        res.json(requests);
    } catch (error) {
        console.error('[getFriendRequests]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// ACCEPT FRIEND REQUEST
// PUT /api/friends/request/:id/accept
// ─────────────────────────────────────────────────────
export async function acceptFriendRequest(req: Request, res: Response) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== 'string') {
            res.status(400).json({ error: 'Friendship ID is required' });
            return;
        }

        const [existing] = await db
            .select()
            .from(friendships)
            .where(
                and(
                    eq(friendships.id, id),
                    eq(friendships.receiverId, req.user!.id),
                    eq(friendships.status, 'pending')
                )
            )
            .limit(1);

        if (!existing) {
            res.status(404).json({ error: 'Friend request not found' });
            return;
        }

        const [updated] = await db
            .update(friendships)
            .set({
                status: 'accepted',
                updatedAt: new Date(),
            })
            .where(eq(friendships.id, id))
            .returning();

        const [sender] = await db
            .select({
                id: users.id,
                name: users.name,
                username: users.username,
            })
            .from(users)
            .where(eq(users.id, existing.senderId))
            .limit(1);

        res.json({
            message: 'Friend request accepted',
            friendship: updated,
            user: sender,
        });
    } catch (error) {
        console.error('[acceptFriendRequest]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// DECLINE FRIEND REQUEST
// PUT /api/friends/request/:id/decline
// ─────────────────────────────────────────────────────
export async function declineFriendRequest(req: Request, res: Response) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== 'string') {
            res.status(400).json({ error: 'Friendship ID is required' });
            return;
        }

        const [existing] = await db
            .select()
            .from(friendships)
            .where(
                and(
                    eq(friendships.id, id),
                    eq(friendships.receiverId, req.user!.id),
                    eq(friendships.status, 'pending')
                )
            )
            .limit(1);

        if (!existing) {
            res.status(404).json({ error: 'Friend request not found' });
            return;
        }

        await db
            .update(friendships)
            .set({
                status: 'declined',
                updatedAt: new Date(),
            })
            .where(eq(friendships.id, id));

        res.json({ message: 'Friend request declined' });
    } catch (error) {
        console.error('[declineFriendRequest]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// GET ALL FRIENDS (accepted only)
// GET /api/friends
// ─────────────────────────────────────────────────────
export async function getFriends(req: Request, res: Response) {
    try {
        // Friends where I am the sender
        const senderFriends = await db
            .select({
                friendshipId: friendships.id,
                id: users.id,
                name: users.name,
                username: users.username,
                bio: users.bio,
                lastSeenAt: users.lastSeenAt,
            })
            .from(friendships)
            .innerJoin(users, eq(users.id, friendships.receiverId))
            .where(
                and(
                    eq(friendships.senderId, req.user!.id),
                    eq(friendships.status, 'accepted')
                )
            );

        // Friends where I am the receiver
        const receiverFriends = await db
            .select({
                friendshipId: friendships.id,
                id: users.id,
                name: users.name,
                username: users.username,
                bio: users.bio,
                lastSeenAt: users.lastSeenAt,
            })
            .from(friendships)
            .innerJoin(users, eq(users.id, friendships.senderId))
            .where(
                and(
                    eq(friendships.receiverId, req.user!.id),
                    eq(friendships.status, 'accepted')
                )
            );

        const allFriends = [...senderFriends, ...receiverFriends];

        if (allFriends.length === 0) {
            res.json([]);
            return;
        }

        // Check Redis for online presence
        const friendIds = allFriends.map(f => f.id);
        const onlineIds = await getOnlineFriends(friendIds);
        const onlineSet = new Set(onlineIds);

        const friends = allFriends.map(f => ({
            friendshipId: f.friendshipId,
            id: f.id,
            name: f.name,
            username: f.username,
            bio: f.bio,
            isOnline: onlineSet.has(f.id),
            lastSeenAt: f.lastSeenAt,
        }));

        // Sort: online first, then alphabetically
        friends.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json(friends);
    } catch (error) {
        console.error('[getFriends]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// REMOVE FRIEND
// DELETE /api/friends/:id  (:id = friendshipId)
// ─────────────────────────────────────────────────────
export async function removeFriend(req: Request, res: Response) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== 'string') {
            res.status(400).json({ error: 'Friendship ID is required' });
            return;
        }

        const [existing] = await db
            .select()
            .from(friendships)
            .where(
                and(
                    eq(friendships.id, id),
                    or(
                        eq(friendships.senderId, req.user!.id),
                        eq(friendships.receiverId, req.user!.id)
                    )
                )
            )
            .limit(1);

        if (!existing) {
            res.status(404).json({ error: 'Friendship not found' });
            return;
        }

        await db
            .delete(friendships)
            .where(eq(friendships.id, id));

        res.json({ message: 'Friend removed successfully' });
    } catch (error) {
        console.error('[removeFriend]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// PING PRESENCE — call every 30s from client
// POST /api/friends/ping
// ─────────────────────────────────────────────────────
export async function pingPresence(req: Request, res: Response) {
    try {
        await setUserOnline(req.user!.id);

        await db
            .update(users)
            .set({ lastSeenAt: new Date() })
            .where(eq(users.id, req.user!.id));

        res.json({ status: 'online' });
    } catch (error) {
        console.error('[pingPresence]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// GO OFFLINE — call on logout or app background
// POST /api/friends/offline
// ─────────────────────────────────────────────────────
export async function goOffline(req: Request, res: Response) {
    try {
        await setUserOffline(req.user!.id);

        await db
            .update(users)
            .set({ lastSeenAt: new Date() })
            .where(eq(users.id, req.user!.id));

        res.json({ status: 'offline' });
    } catch (error) {
        console.error('[goOffline]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─────────────────────────────────────────────────────
// GET FRIEND COUNT — for profile stats
// GET /api/friends/count
// ─────────────────────────────────────────────────────
export async function getFriendCount(req: Request, res: Response) {
    try {
        const result = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(friendships)
            .where(
                and(
                    eq(friendships.status, 'accepted'),
                    or(
                        eq(friendships.senderId, req.user!.id),
                        eq(friendships.receiverId, req.user!.id)
                    )
                )
            );

        res.json({ count: result[0]?.count ?? 0 });
    } catch (error) {
        console.error('[getFriendCount]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}