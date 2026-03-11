import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redis = new Redis(process.env.REDIS_URL!, {
    tls: {},
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

// Presence helpers
const ONLINE_TTL = 60; // seconds — refresh every 30s from client

export async function setUserOnline(userId: string) {
    await redis.setex(`presence:${userId}`, ONLINE_TTL, '1');
}

export async function setUserOffline(userId: string) {
    await redis.del(`presence:${userId}`);
}

export async function isUserOnline(userId: string): Promise<boolean> {
    const val = await redis.get(`presence:${userId}`);
    return val === '1';
}

export async function getOnlineFriends(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const pipeline = redis.pipeline();
    userIds.forEach(id => pipeline.get(`presence:${id}`));
    const results = await pipeline.exec();
    return userIds.filter((id, i) => results?.[i]?.[1] === '1');
}