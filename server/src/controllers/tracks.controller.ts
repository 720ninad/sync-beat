import { Request, Response } from 'express';
import { db } from '../db';
import { tracks, likedTracks, syncSessions, listenHistory } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, generateTrackKey } from '../lib/r2';
import { getAudioUrl, searchYouTube } from '../lib/ytdlp';
// External music search interfaces
interface ExternalTrack {
    id: string;
    name: string;
    artist: string;
    album?: string;
    duration?: number;
    image?: string;
    preview_url?: string | null;
    external_id: string;
    source: 'jiosaavn' | 'youtube';
}


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
                previewUrl: tracks.previewUrl,
                mimeType: tracks.mimeType,
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

        // Only delete from R2 if it's an uploaded track (not external)
        if (track.fileUrl && track.mimeType !== 'external') {
            try {
                const key = track.fileUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
                await deleteFromR2(key);
            } catch (r2Error) {
                console.error('R2 deletion error (continuing with DB deletion):', r2Error);
                // Continue with DB deletion even if R2 deletion fails
            }
        }

        // Delete related records first to avoid FK violations
        await db.delete(syncSessions).where(eq(syncSessions.trackId, trackId));
        await db.delete(listenHistory).where(eq(listenHistory.trackId, trackId));
        await db.delete(likedTracks).where(eq(likedTracks.trackId, trackId));

        // Delete from DB
        await db.delete(tracks).where(eq(tracks.id, trackId));

        res.json({ message: 'Track deleted' });
    } catch (error) {
        console.error('Delete track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ─── SEARCH EXTERNAL TRACKS ─────────────────────────
export async function searchExternalTracks(req: Request, res: Response) {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter is required' });
            return;
        }

        const results = await searchFromMultipleSources(q);
        res.json(results);
    } catch (error) {
        console.error('External search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
}

// ─── ADD EXTERNAL TRACK ─────────────────────────────
export async function addExternalTrack(req: Request, res: Response) {
    try {
        const { name, artist, album, duration, image, external_id, source, preview_url } = req.body;

        if (!name || !artist) {
            res.status(400).json({ error: 'Name and artist are required' });
            return;
        }

        // Allow adding tracks even without preview URLs (for metadata-only tracks)
        // Users can still see track info and potentially find other versions

        // Save external track reference to DB
        const [track] = await db.insert(tracks).values({
            uploaderId: req.user!.id,
            title: name.trim(),
            artist: artist.trim(),
            duration: duration || 0,
            fileUrl: '', // No file URL for external tracks
            fileSize: 0,
            mimeType: 'external',
            isPublic: false,
            externalId: external_id,
            externalSource: source,
            albumName: album,
            imageUrl: image,
            previewUrl: preview_url || null, // Save the preview URL if available
        }).returning();

        res.status(201).json({
            message: 'External track added to library',
            track,
        });
    } catch (error) {
        console.error('Add external track error:', error);
        res.status(500).json({ error: 'Failed to add external track' });
    }
}

async function searchFromMultipleSources(query: string): Promise<ExternalTrack[]> {
    try {
        const ytResults = await searchYouTube(query, 10);
        const tracks = await Promise.all(ytResults.map(mapToTrack));
        // Filter out nulls (videos where audio extraction failed)
        return tracks.filter((t): t is ExternalTrack => t !== null);
    } catch (error) {
        console.error('YouTube search error:', error);
        return [];
    }
}

async function mapToTrack(video: { id: string; title: string; artist: string; duration: number; thumbnail: string }): Promise<ExternalTrack | null> {
    try {
        const videoId = video.id;

        // Build the stream URL — audio is proxied through our endpoint
        // No need to call getAudioUrl here; streamTrack handles extraction + caching on demand
        return {
            id: `yt_${videoId}`,
            name: video.title,
            artist: video.artist,
            album: "",
            duration: video.duration,
            image: video.thumbnail,
            preview_url: null,          // no direct URL — client uses stream endpoint
            external_id: videoId,
            source: "youtube" as any,   // mark as youtube so client routes to /stream/:id
        };
    } catch (err) {
        console.error("Mapping error:", err);
        return null;
    }
}

// ─── STREAM TRACK ────────────────────────────────────
export async function streamTrack(req: Request, res: Response) {
    try {
        const { videoId } = req.params;
        const audioUrl = await getAudioUrl(Array.isArray(videoId) ? videoId[0] : videoId);

        if (!audioUrl) {
            res.status(404).json({ error: 'Could not extract audio URL' });
            return;
        }

        const rangeHeader = req.headers['range'];

        // Forward range header to upstream so seeking works
        const upstreamHeaders: Record<string, string> = {};
        if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

        const upstream = await fetch(audioUrl, { headers: upstreamHeaders });

        if (!upstream.ok || !upstream.body) {
            res.status(502).json({ error: 'Failed to fetch audio stream' });
            return;
        }

        const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
        const contentLength = upstream.headers.get('content-length');
        const contentRange = upstream.headers.get('content-range');

        // Mirror the upstream status (206 Partial Content or 200)
        const status = upstream.status === 206 ? 206 : 200;

        res.status(status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);

        const { Readable } = await import('stream');
        Readable.fromWeb(upstream.body as any).pipe(res);
    } catch (err) {
        console.error('Stream error:', err);
        res.status(500).json({ error: 'Streaming failed' });
    }
}
