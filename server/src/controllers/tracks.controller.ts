import { Request, Response } from 'express';
import { db } from '../db';
import { tracks, likedTracks } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, generateTrackKey } from '../lib/r2';
import { z } from 'zod';

// ─── UPLOAD TRACK ────────────────────────────────────
export async function uploadTrack(req: Request, res: Response) {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { title, artist, isPublic } = req.body;

        if (!title) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }

        // Validate file type
        const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            res.status(400).json({ error: 'Only audio files are allowed (mp3, wav, ogg, m4a)' });
            return;
        }

        // Max 50MB
        if (req.file.size > 50 * 1024 * 1024) {
            res.status(400).json({ error: 'File size must be under 50MB' });
            return;
        }

        // Upload to R2
        const key = generateTrackKey(req.file.originalname);
        const fileUrl = await uploadToR2(req.file.buffer, key, req.file.mimetype);

        // Save to DB
        const [track] = await db.insert(tracks).values({
            uploaderId: req.user!.id,
            title: title.trim(),
            artist: artist?.trim() || 'Unknown',
            duration: parseInt(req.body.duration || '0'),
            fileUrl,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            isPublic: isPublic === 'true',
        }).returning();

        res.status(201).json({
            message: 'Track uploaded successfully',
            track,
        });
    } catch (error) {
        console.error('uploadTrack error:', error);
        res.status(500).json({ error: 'Failed to upload track' });
    }
}

// ─── GET MY TRACKS ───────────────────────────────────
export async function getMyTracks(req: Request, res: Response) {
    try {
        const myTracks = await db
            .select()
            .from(tracks)
            .where(eq(tracks.uploaderId, req.user!.id))
            .orderBy(desc(tracks.createdAt));

        res.json(myTracks);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── GET PUBLIC TRACKS ───────────────────────────────
export async function getPublicTracks(req: Request, res: Response) {
    try {
        const publicTracks = await db
            .select({
                id: tracks.id,
                title: tracks.title,
                artist: tracks.artist,
                duration: tracks.duration,
                fileUrl: tracks.fileUrl,
                playCount: tracks.playCount,
                createdAt: tracks.createdAt,
            })
            .from(tracks)
            .where(eq(tracks.isPublic, true))
            .orderBy(desc(tracks.playCount));

        res.json(publicTracks);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── GET LIKED TRACKS ────────────────────────────────
export async function getLikedTracks(req: Request, res: Response) {
    try {
        const liked = await db
            .select({
                id: tracks.id,
                title: tracks.title,
                artist: tracks.artist,
                duration: tracks.duration,
                fileUrl: tracks.fileUrl,
                playCount: tracks.playCount,
                createdAt: tracks.createdAt,
                likedAt: likedTracks.createdAt,
            })
            .from(likedTracks)
            .innerJoin(tracks, eq(tracks.id, likedTracks.trackId))
            .where(eq(likedTracks.userId, req.user!.id))
            .orderBy(desc(likedTracks.createdAt));

        res.json(liked);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── LIKE TRACK ──────────────────────────────────────
export async function likeTrack(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const trackId = Array.isArray(id) ? id[0] : id;

        const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId));
        if (!track) {
            res.status(404).json({ error: 'Track not found' });
            return;
        }

        const [existing] = await db
            .select()
            .from(likedTracks)
            .where(and(eq(likedTracks.userId, req.user!.id), eq(likedTracks.trackId, trackId)));

        if (existing) {
            res.status(400).json({ error: 'Already liked' });
            return;
        }

        await db.insert(likedTracks).values({
            userId: req.user!.id,
            trackId: trackId,
        });

        res.json({ message: 'Track liked' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── UNLIKE TRACK ────────────────────────────────────
export async function unlikeTrack(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const trackId = Array.isArray(id) ? id[0] : id;

        await db
            .delete(likedTracks)
            .where(and(eq(likedTracks.userId, req.user!.id), eq(likedTracks.trackId, trackId)));

        res.json({ message: 'Track unliked' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── DELETE TRACK ────────────────────────────────────
export async function deleteTrack(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const trackId = Array.isArray(id) ? id[0] : id;

        const [track] = await db
            .select()
            .from(tracks)
            .where(and(eq(tracks.id, trackId), eq(tracks.uploaderId, req.user!.id)));

        if (!track) {
            res.status(404).json({ error: 'Track not found or not yours' });
            return;
        }

        // Delete from R2
        const key = track.fileUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
        await deleteFromR2(key);

        // Delete from DB
        await db.delete(tracks).where(eq(tracks.id, trackId));

        res.json({ message: 'Track deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}