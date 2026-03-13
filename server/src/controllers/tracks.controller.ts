import { Request, Response } from 'express';
import { db } from '../db';
import { tracks, likedTracks } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { uploadToR2, deleteFromR2, generateTrackKey } from '../lib/r2';
// External music search interfaces
interface ExternalTrack {
    id: string;
    name: string;
    artist: string;
    album?: string;
    duration?: number;
    image?: string;
    preview_url?: string;
    external_id: string;
    source: 'jiosaavn';
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
        // Search JioSaavn API
        const jiosaavnResults = await searchJioSaavn(query);
        return jiosaavnResults;
    } catch (error) {
        console.error('JioSaavn search error:', error);
        return [];
    }
}

// JioSaavn search implementation
async function searchJioSaavn(query: string): Promise<ExternalTrack[]> {
    try {
        const searchUrl = `https://music-api-five-henna.vercel.app/api/search?query=${encodeURIComponent(query)}`;

        const response = await fetch(searchUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            console.error('JioSaavn API error:', response.status);
            return [];
        }

        const data = await response.json();
        if (!data.data?.songs?.results || data.data.songs.results.length === 0) {
            return [];
        }

        // Get detailed info for each song
        const detailedTracks = await Promise.all(
            data.data.songs.results.slice(0, 10).map(async (song: any) => {
                try {
                    const detailUrl = `https://backend-listenfree-primary-up.vercel.app/api/songs/${song.id}`;
                    const detailResponse = await fetch(detailUrl);

                    if (!detailResponse.ok) {
                        return null;
                    }

                    const detailData = await detailResponse.json();
                    const songDetail = detailData.data?.[0];
                    if (!songDetail) {
                        return null;
                    }

                    // Get the highest quality audio URL available
                    const audioUrl = songDetail.downloadUrl?.find((url: any) => url.quality === "320kbps")?.url ||
                        songDetail.downloadUrl?.find((url: any) => url.quality === "160kbps")?.url ||
                        songDetail.downloadUrl?.find((url: any) => url.quality === "96kbps")?.url;

                    // Get the best quality image
                    const imageUrl = songDetail.image?.find((img: any) => img.quality === "500x500")?.url ||
                        songDetail.image?.find((img: any) => img.quality === "150x150")?.url ||
                        songDetail.image?.find((img: any) => img.quality === "50x50")?.url;

                    // Get primary artist name
                    const artistName = songDetail.artists?.primary?.[0]?.name ||
                        songDetail.artists?.all?.[0]?.name ||
                        'Unknown Artist';

                    return {
                        id: `jiosaavn_${songDetail.id}`,
                        name: songDetail.name,
                        artist: artistName,
                        album: songDetail.album?.name || '',
                        duration: songDetail.duration,
                        image: imageUrl,
                        preview_url: audioUrl,
                        external_id: songDetail.id.toString(),
                        source: 'jiosaavn' as const,
                    };
                } catch (error) {
                    console.error('Error fetching song details:', error);
                    return null;
                }
            })
        );

        // Filter out null results
        return detailedTracks.filter((track): track is ExternalTrack => track !== null);
    } catch (error) {
        console.error('JioSaavn search error:', error);
        return [];
    }
}