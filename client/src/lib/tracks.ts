import { api } from './api';
import { getToken } from './storage';

const authHeader = async () => ({
    Authorization: `Bearer ${await getToken()}`,
});

export async function getMyTracks() {
    const res = await api.get('/tracks/my', { headers: await authHeader() });
    return res.data;
}

export async function getPublicTracks() {
    const res = await api.get('/tracks/public', { headers: await authHeader() });
    return res.data;
}

export async function getLikedTracks() {
    const res = await api.get('/tracks/liked', { headers: await authHeader() });
    return res.data;
}

export async function likeTrack(id: string) {
    const res = await api.post(`/tracks/${id}/like`, {}, { headers: await authHeader() });
    return res.data;
}

export async function unlikeTrack(id: string) {
    const res = await api.delete(`/tracks/${id}/like`, { headers: await authHeader() });
    return res.data;
}

export async function deleteTrack(id: string) {
    const res = await api.delete(`/tracks/${id}`, { headers: await authHeader() });
    return res.data;
}

export async function uploadTrack(
    file: { uri: string; name: string; mimeType: string; size: number },
    metadata: { title: string; artist: string; duration: number; isPublic: boolean },
    onProgress?: (percent: number) => void,
) {
    const token = await getToken();
    const formData = new FormData();

    // ✅ Web vs Native file handling
    if (typeof window !== 'undefined' && file.uri.startsWith('blob:')) {
        // Web — fetch the blob and append it directly
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append('file', blob, file.name);
    } else if (typeof window !== 'undefined' && file.uri.startsWith('data:')) {
        // Web — base64 data URL
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append('file', blob, file.name);
    } else {
        // React Native
        formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: file.mimeType || 'audio/mpeg',
        } as any);
    }

    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist || 'Unknown');
    formData.append('duration', metadata.duration.toString());
    formData.append('isPublic', metadata.isPublic.toString());

    const res = await api.post('/tracks', formData, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        },
    });

    return res.data;
}

export function formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}