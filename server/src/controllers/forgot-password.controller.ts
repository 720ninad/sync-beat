import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { users, otpCodes } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { sendOtpEmail } from '../lib/email';

const sendOtpSchema = z.object({
    email: z.string().email(),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    code: z.string().length(6),
});

const resetPasswordSchema = z.object({
    email: z.string().email(),
    code: z.string().length(6),
    newPassword: z.string().min(6),
});

function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(req: Request, res: Response) {
    try {
        const { email } = sendOtpSchema.parse(req.body);

        // Check user exists
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) {
            // Don't reveal if email exists or not
            res.json({ message: 'If this email exists, a code has been sent' });
            return;
        }

        // Invalidate old OTPs for this email
        await db
            .update(otpCodes)
            .set({ used: true })
            .where(eq(otpCodes.email, email));

        // Generate new OTP
        const code = generateOtp();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.insert(otpCodes).values({
            email,
            code,
            used: false,
            expiresAt,
        });

        // Send email
        await sendOtpEmail(email, code, user.name);

        res.json({ message: 'If this email exists, a code has been sent' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function verifyOtp(req: Request, res: Response) {
    try {
        const { email, code } = verifyOtpSchema.parse(req.body);

        const [otp] = await db
            .select()
            .from(otpCodes)
            .where(
                and(
                    eq(otpCodes.email, email),
                    eq(otpCodes.code, code),
                    eq(otpCodes.used, false),
                )
            );

        if (!otp) {
            res.status(400).json({ error: 'Invalid or expired code' });
            return;
        }

        if (new Date() > otp.expiresAt) {
            res.status(400).json({ error: 'Code has expired, please request a new one' });
            return;
        }

        res.json({ message: 'Code verified successfully', valid: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function resetPassword(req: Request, res: Response) {
    try {
        const { email, code, newPassword } = resetPasswordSchema.parse(req.body);

        // Verify OTP again
        const [otp] = await db
            .select()
            .from(otpCodes)
            .where(
                and(
                    eq(otpCodes.email, email),
                    eq(otpCodes.code, code),
                    eq(otpCodes.used, false),
                )
            );

        if (!otp) {
            res.status(400).json({ error: 'Invalid or expired code' });
            return;
        }

        if (new Date() > otp.expiresAt) {
            res.status(400).json({ error: 'Code has expired, please request a new one' });
            return;
        }

        // Mark OTP as used
        await db
            .update(otpCodes)
            .set({ used: true })
            .where(eq(otpCodes.id, otp.id));

        // Update password
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await db
            .update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.email, email));

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues[0].message });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}