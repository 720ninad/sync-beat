import { api } from './api';
import { getToken } from './storage';

export interface ExternalTrack {
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

const authHeader = async () => ({
    Authorization: `Bearer ${await getToken()}`,
});

// Search tracks from external APIs
export async function searchExternalTracks(query: string): Promise<ExternalTrack[]> {
    try {
        const res = await api.get(`/tracks/search?q=${encodeURIComponent(query)}`, {
            headers: await authHeader(),
        });
        return res.data;
    } catch (error) {
        console.error('External search failed:', error);
        return [];
    }
}

// Add external track to user's library
export async function addExternalTrack(track: ExternalTrack): Promise<any> {
    try {
        const res = await api.post('/tracks/external', {
            name: track.name,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            image: track.image,
            external_id: track.external_id,
            source: track.source,
            preview_url: track.preview_url, // Include preview URL
        }, {
            headers: await authHeader(),
        });
        return res.data;
    } catch (error) {
        console.error('Failed to add external track:', error);
        throw error;
    }
}