import { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function registerToken(req: Request, res: Response) {
    try {
        const { pushToken } = req.body;
        if (!pushToken) {
            res.status(400).json({ error: 'pushToken required' });
            return;
        }
        await db.update(users)
            .set({ pushToken })
            .where(eq(users.id, req.user!.id));

        res.json({ ok: true });
    } catch (err) {
        console.error('registerToken error:', err);
        res.status(500).json({ error: 'Failed to register token' });
    }
}