import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Returns fresh TURN credentials — requires auth so it's not abused
router.get('/credentials', authMiddleware, async (req: any, res: any) => {
    const apiKey = process.env.METERED_API_KEY;
    const domain = process.env.METERED_DOMAIN; // e.g. "syncbeat.metered.live"

    if (!apiKey || !domain) {
        // Fallback: return only STUN if not configured
        return res.json({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        });
    }

    try {
        const response = await fetch(
            `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`
        );
        const iceServers = await response.json();
        return res.json({ iceServers });
    } catch (err) {
        console.error('Failed to fetch TURN credentials:', err);
        return res.json({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        });
    }
});

export default router;
