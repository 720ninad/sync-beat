import { Audio } from 'expo-av';
import Constants from 'expo-constants';

const SERVER_URL =
    Constants.expoConfig?.extra?.apiUrl?.replace('/api', '') ||
    'http://localhost:3000';

interface Track {
    id: string;
    title?: string;
    name?: string;
    artist: string;
    fileUrl?: string;
    preview_url?: string;
    previewUrl?: string;
    mimeType?: string;
    source?: string;
    externalSource?: string;
    external_id?: string;   // search results (snake_case)
    externalId?: string;    // saved DB rows (camelCase from Drizzle)
}

class AudioPlayerService {
    private sound: Audio.Sound | null = null;
    private currentTrack: Track | null = null;
    private isLoaded = false;

    async playTrack(track: Track): Promise<boolean> {
        try {
            // Stop current track if playing
            await this.stop();

            // Determine the audio URL
            let audioUrl: string | null = null;

            // Resolve the video ID regardless of casing (search = external_id, DB = externalId)
            const ytId = track.external_id || track.externalId;

            if (track.fileUrl && track.mimeType !== 'external') {
                // Uploaded track — use R2 file URL directly
                audioUrl = track.fileUrl;
            } else if (track.preview_url) {
                audioUrl = track.preview_url;
            } else if (track.previewUrl) {
                audioUrl = track.previewUrl;
            } else if (ytId && (track.source === 'youtube' || track.externalSource === 'youtube')) {
                // YouTube track (search result or saved) — proxy through stream endpoint
                audioUrl = `${SERVER_URL}/api/tracks/stream/${ytId}`;
            }

            if (!audioUrl) {
                return false;
            }

            // Create and load new sound
            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUrl },
                {
                    shouldPlay: true,
                    isLooping: false,
                    volume: 1.0,
                }
            );

            this.sound = sound;
            this.currentTrack = track;
            this.isLoaded = true;

            // Set up playback status update
            this.sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    this.stop();
                }
            });

            return true;
        } catch (error) {
            return false;
        }
    }

    async pause(): Promise<void> {
        if (this.sound && this.isLoaded) {
            await this.sound.pauseAsync();
        }
    }

    async resume(): Promise<void> {
        if (this.sound && this.isLoaded) {
            await this.sound.playAsync();
        }
    }

    async stop(): Promise<void> {
        if (this.sound) {
            try {
                await this.sound.unloadAsync();
            } catch (error) {
                // Ignore unload errors
            }
            this.sound = null;
            this.currentTrack = null;
            this.isLoaded = false;
        }
    }

    getCurrentTrack(): Track | null {
        return this.currentTrack;
    }

    async getStatus() {
        if (this.sound && this.isLoaded) {
            return await this.sound.getStatusAsync();
        }
        return null;
    }

    async isPlaying(): Promise<boolean> {
        const status = await this.getStatus();
        return status?.isLoaded && status?.isPlaying || false;
    }

    async seek(positionMs: number): Promise<void> {
        if (this.sound && this.isLoaded && isFinite(positionMs) && positionMs >= 0) {
            try {
                await this.sound.setPositionAsync(positionMs);
            } catch (error) {
                // Ignore seek errors - they can happen if the position is invalid
                console.warn('Seek failed:', error);
            }
        }
    }
}

// Export singleton instance
export const audioPlayer = new AudioPlayerService();