import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const registerSchema = z.object({
    name: z.string().min(2),
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: z.string().min(6),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const updateProfileSchema = z.object({
    name: z.string().min(2),
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    bio: z.string().max(120).optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
});


function generateToken(user: { id: string; email: string; username: string; name: string }) {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username, name: user.name },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
    );
}

export async function register(req: Request, res: Response) {
    try {
        const body = registerSchema.parse(req.body);

        const existing = await db.select().from(users).where(eq(users.email, body.email));
        if (existing.length > 0) {
            res.status(400).json({ error: 'Email already in use' });
            return;
        }

        const existingUsername = await db.select().from(users).where(eq(users.username, body.username));
        if (existingUsername.length > 0) {
            res.status(400).json({ error: 'Username already taken' });
            return;
        }

        const passwordHash = await bcrypt.hash(body.password, 10);

        const [user] = await db.insert(users).values({
            name: body.name,
            username: body.username,
            email: body.email,
            passwordHash: passwordHash,
            bio: '',
        }).returning();

        const token = generateToken(user);

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                bio: user.bio,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const body = loginSchema.parse(req.body);

        const [user] = await db.select().from(users).where(eq(users.email, body.email));
        if (!user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        const valid = await bcrypt.compare(body.password, user.passwordHash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        const token = generateToken(user);

        res.json({
            message: 'Logged in successfully',
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                bio: user.bio,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function me(req: Request, res: Response) {
    try {
        const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            bio: user.bio,
            createdAt: user.createdAt,
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function updateProfile(req: Request, res: Response) {
    try {
        const body = updateProfileSchema.parse(req.body);

        // Check username taken by someone else
        if (body.username !== req.user!.username) {
            const existing = await db.select().from(users).where(eq(users.username, body.username));
            if (existing.length > 0) {
                res.status(400).json({ error: 'Username already taken' });
                return;
            }
        }

        // Check email taken by someone else
        if (body.email !== req.user!.email) {
            const existing = await db.select().from(users).where(eq(users.email, body.email));
            if (existing.length > 0) {
                res.status(400).json({ error: 'Email already in use' });
                return;
            }
        }

        const [updated] = await db
            .update(users)
            .set({
                name: body.name,
                username: body.username,
                email: body.email,
                bio: body.bio ?? '',
                updatedAt: new Date(),
            })
            .where(eq(users.id, req.user!.id))
            .returning();

        // Generate new token with updated info
        const token = generateToken(updated);

        res.json({
            message: 'Profile updated successfully',
            token,
            user: {
                id: updated.id,
                name: updated.name,
                username: updated.username,
                email: updated.email,
                bio: updated.bio,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}


export async function changePassword(req: Request, res: Response) {
    try {
        const body = changePasswordSchema.parse(req.body);

        const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Verify current password
        const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
        if (!valid) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }

        // Check new password is different
        const same = await bcrypt.compare(body.newPassword, user.passwordHash);
        if (same) {
            res.status(400).json({ error: 'New password must be different from current' });
            return;
        }

        const newHash = await bcrypt.hash(body.newPassword, 10);

        await db
            .update(users)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(users.id, req.user!.id));

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}