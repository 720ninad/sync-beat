import { Audio } from 'expo-av';

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
    external_id?: string;
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

            if (track.fileUrl && track.mimeType !== 'external') {
                // Uploaded track
                audioUrl = track.fileUrl;
            } else if (track.preview_url) {
                // External track with preview (from search results)
                audioUrl = track.preview_url;
            } else if (track.previewUrl) {
                // External track with preview (from database)
                audioUrl = track.previewUrl;
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