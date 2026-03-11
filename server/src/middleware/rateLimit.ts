import rateLimit from 'express-rate-limit';

// ─── GENERAL API ─────────────────────────────────────
// 100 requests per minute per IP
export const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
});

// ─── AUTH ROUTES ─────────────────────────────────────
// 10 attempts per 15 minutes (brute force protection)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ─── UPLOAD ──────────────────────────────────────────
// 20 uploads per hour
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload limit reached. Try again in an hour.' },
});

// ─── OTP / PASSWORD RESET ────────────────────────────
// 5 attempts per 15 minutes
export const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
});