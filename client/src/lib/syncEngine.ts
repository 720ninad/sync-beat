import { Audio, AVPlaybackStatus } from 'expo-av';
import { getSocket } from './socket';

export type SyncRole = 'host' | 'listener';

export interface SyncTrack {
    url: string;
    title: string;
    emoji: string;
    durationMs: number;
}

export interface SyncTrack {
    url: string;
    title: string;
    emoji: string;
    durationMs: number;
    trackId?: string;   // ← ADD THIS
}

type OnStatusUpdate = (status: {
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    isLoaded: boolean;
}) => void;

export class SyncEngine {
    sound: Audio.Sound | null = null;
    private callId: string;
    myUserId: string;
    private clockOffset: number = 0;
    onStatus: OnStatusUpdate;
    private track: SyncTrack | null = null;

    private playStartServerTime: number = 0;
    private pausedAtMs: number = 0;
    private isPaused: boolean = true;

    private driftTimer: ReturnType<typeof setInterval> | null = null;

    constructor(callId: string, myUserId: string, onStatus: OnStatusUpdate) {
        this.callId = callId;
        this.myUserId = myUserId;
        this.onStatus = onStatus;
    }

    setStatusCallback(cb: OnStatusUpdate) {
        this.onStatus = cb;
    }

    // ─── 1. CLOCK OFFSET ─────────────────────────────────
    async measureClockOffset(): Promise<number> {
        return new Promise((resolve) => {
            const socket = getSocket();
            const clientT0 = Date.now();
            socket?.emit('sync:ping', { clientTime: clientT0 });
            socket?.once('sync:pong', ({ clientTime, serverTime }: any) => {
                const clientT1 = Date.now();
                const roundTrip = clientT1 - clientTime;
                const offset = serverTime - (clientTime + roundTrip / 2);
                this.clockOffset = offset;
                console.log(`Clock offset: ${offset}ms  RTT: ${roundTrip}ms`);
                resolve(offset);
            });
            setTimeout(() => resolve(0), 3000);
        });
    }

    serverNow(): number {
        return Date.now() + this.clockOffset;
    }

    // ─── 2. LOAD TRACK ───────────────────────────────────
    async loadTrack(track: SyncTrack): Promise<void> {
        this._stopDriftCheck();
        if (this.sound) {
            try { await this.sound.stopAsync(); } catch { }
            try { await this.sound.unloadAsync(); } catch { }
            this.sound = null;
        }
        this.track = track;
        this.playStartServerTime = 0;
        this.pausedAtMs = 0;
        this.isPaused = true;

        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
        });
        const { sound } = await Audio.Sound.createAsync(
            { uri: track.url },
            { shouldPlay: false, positionMillis: 0 },
            this._onPlaybackStatus,
        );
        this.sound = sound;
        console.log('✅ Track loaded:', track.title);
    }

    private _onPlaybackStatus = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        this.onStatus({
            isPlaying: status.isPlaying,
            positionMs: status.positionMillis,
            durationMs: status.durationMillis ?? this.track?.durationMs ?? 0,
            isLoaded: true,
        });
    };

    // ─── 3. EMIT START ───────────────────────────────────
    async emitStart(): Promise<void> {
        if (!this.track) return;
        await this.measureClockOffset();
        const serverTime = this.serverNow();
        getSocket()?.emit('sync:start', {
            callId: this.callId,
            trackUrl: this.track.url,
            trackTitle: this.track.title,
            trackEmoji: this.track.emoji,
            trackId: this.track.trackId,
            serverTime,
            pickerUserId: this.myUserId,
        });
        console.log('📡 sync:start emitted for', this.track.title);
    }

    // ─── 4. PICKER: PLAY FROM START ──────────────────────
    async playFromStart(): Promise<void> {
        if (!this.sound) return;
        try {
            const serverTime = this.serverNow();
            await this.sound.setPositionAsync(0);
            // Small delay — lets audio context fully initialize on web
            await new Promise(r => setTimeout(r, 150));
            await this._safePlay(this.sound);
            this.playStartServerTime = serverTime;
            this.isPaused = false;
            this._startDriftCheck();
        } catch (err) { console.error('playFromStart error:', err); }
    }


    // ─── 5. RECEIVER: SYNC AND PLAY ──────────────────────
    async receiveStart(trackUrl: string, trackTitle: string, trackEmoji: string, serverTime: number): Promise<void> {
        console.log('📥 receiveStart serverTime=', serverTime);
        try {
            await this.loadTrack({ url: trackUrl, title: trackTitle, emoji: trackEmoji, durationMs: 0 });
        } catch (err) {
            console.error('receiveStart loadTrack failed:', err);
            return;
        }
        const elapsed = Math.max(0, this.serverNow() - serverTime);
        try {
            await this.sound!.setPositionAsync(elapsed);
            // Small delay — lets audio buffer before play on web
            await new Promise(r => setTimeout(r, 150));
            await this._safePlay(this.sound!);
            this.playStartServerTime = serverTime;
            this.isPaused = false;
            this._startDriftCheck();
            console.log(`receiveStart — seeked to ${elapsed}ms`);
        } catch (err) { console.error('receiveStart error:', err); }
    }

    // ─── 6. RESYNC AFTER RELOAD ──────────────────────────
    async resyncFromState(
        trackUrl: string,
        trackTitle: string,
        trackEmoji: string,
        positionMs: number,
        isPlaying: boolean,
        serverTime: number,
    ): Promise<void> {
        console.log('🔄 resyncFromState', { positionMs, isPlaying });
        try {
            await this.loadTrack({ url: trackUrl, title: trackTitle, emoji: trackEmoji, durationMs: 0 });
        } catch (err) {
            console.error('resyncFromState loadTrack failed:', err);
            return;
        }
        if (isPlaying) {
            const elapsed = Math.max(0, this.serverNow() - serverTime);
            const seekTo = positionMs + elapsed;
            try {
                await this.sound!.setPositionAsync(seekTo);
                await new Promise(r => setTimeout(r, 150));
                await this._safePlay(this.sound!);
                this.playStartServerTime = serverTime - positionMs;
                this.isPaused = false;
                this._startDriftCheck();
                console.log(`🔄 Resynced playing at ${seekTo}ms`);
            } catch (err) { console.error('resyncFromState play error:', err); }
        } else {
            try {
                await this.sound!.setPositionAsync(positionMs);
                this.pausedAtMs = positionMs;
                this.isPaused = true;
            } catch { }
        }
    }
    // ─── 7. PAUSE ────────────────────────────────────────
    async pause(): Promise<void> {
        if (!this.sound) return;
        const status = await this.sound.getStatusAsync();
        if (!status.isLoaded || !status.isPlaying) return;
        const positionMs = status.positionMillis;
        await this.sound.pauseAsync();
        this.pausedAtMs = positionMs;
        this.isPaused = true;
        this._stopDriftCheck();
        getSocket()?.emit('sync:pause', {
            callId: this.callId, positionMs, serverTime: this.serverNow(),
        });
        console.log('⏸ pause at', positionMs);
    }

    // ─── 8. RESUME ───────────────────────────────────────
    async resume(): Promise<void> {
        if (!this.sound) return;
        const status = await this.sound.getStatusAsync();
        if (!status.isLoaded || status.isPlaying) return;
        const positionMs = this.pausedAtMs || status.positionMillis;
        const serverTime = this.serverNow();
        await this.sound.setPositionAsync(positionMs);
        await new Promise(r => setTimeout(r, 100));
        await this._safePlay(this.sound);
        this.playStartServerTime = serverTime - positionMs;
        this.isPaused = false;
        this._startDriftCheck();
        getSocket()?.emit('sync:resume', { callId: this.callId, positionMs, serverTime });
    }

    // ─── 9. SEEK ─────────────────────────────────────────
    async seek(positionMs: number): Promise<void> {
        if (!this.sound) return;
        const serverTime = this.serverNow();
        await this.sound.setPositionAsync(positionMs);
        this.playStartServerTime = serverTime - positionMs;
        if (this.isPaused) this.pausedAtMs = positionMs;
        getSocket()?.emit('sync:seek', { callId: this.callId, positionMs, serverTime });
        console.log('⏩ seek to', positionMs);
    }

    // ─── 10. HANDLE INCOMING PAUSE ───────────────────────
    async handlePause(positionMs: number): Promise<void> {
        if (!this.sound) return;
        this._stopDriftCheck();
        try {
            await this.sound.pauseAsync();
            await this.sound.setPositionAsync(positionMs);
            this.pausedAtMs = positionMs;
            this.isPaused = true;
        } catch { }
    }

    // ─── 11. HANDLE INCOMING RESUME ──────────────────────
    async handleResume(positionMs: number, serverTime: number): Promise<void> {
        if (!this.sound) return;
        const elapsed = Math.max(0, this.serverNow() - serverTime);
        const seekTo = positionMs + elapsed;
        try {
            await this.sound.setPositionAsync(seekTo);
            await new Promise(r => setTimeout(r, 100));
            await this._safePlay(this.sound);
            this.playStartServerTime = serverTime - positionMs;
            this.isPaused = false;
            this._startDriftCheck();
        } catch { }
    }

    // ─── 12. HANDLE INCOMING SEEK ────────────────────────
    async handleSeek(positionMs: number, serverTime: number): Promise<void> {
        if (!this.sound) return;
        const elapsed = Math.max(0, this.serverNow() - serverTime);
        const seekTo = this.isPaused ? positionMs : positionMs + elapsed;
        try {
            await this.sound.setPositionAsync(seekTo);
            this.playStartServerTime = serverTime - positionMs;
            if (this.isPaused) this.pausedAtMs = positionMs;
        } catch { }
    }

    // ─── 13. DRIFT CHECK ─────────────────────────────────
    private _startDriftCheck() {
        this._stopDriftCheck();
        this.driftTimer = setInterval(async () => {
            if (!this.sound || this.isPaused || !this.playStartServerTime) return;
            const status = await this.sound.getStatusAsync();
            if (!status.isLoaded || !status.isPlaying) return;
            const expectedMs = this.serverNow() - this.playStartServerTime;
            const actualMs = status.positionMillis;
            const drift = actualMs - expectedMs;
            console.log(`Drift — actual: ${actualMs}ms  expected: ${expectedMs}ms  drift: ${drift}ms`);
            if (Math.abs(drift) > 800) {
                console.log(`⚡ Correcting drift of ${drift}ms`);
                try { await this.sound.setPositionAsync(expectedMs); } catch { }
            }
        }, 8000);
    }

    private _stopDriftCheck() {
        if (this.driftTimer) { clearInterval(this.driftTimer); this.driftTimer = null; }
    }

    // ─── 14. LISTEN FOR EVENTS ───────────────────────────
    listenForEvents(onSongChange: (params: {
        trackUrl: string;
        trackTitle: string;
        trackEmoji: string;
        serverTime: number;
    }) => void): () => void {
        const socket = getSocket();
        if (!socket) return () => { };

        const onSyncStart = async ({ trackUrl, trackTitle, trackEmoji, serverTime, pickerUserId }: any) => {
            if (pickerUserId && pickerUserId === this.myUserId) {
                console.log('🔁 Skipping own sync:start');
                return;
            }
            console.log('📥 Other user picked song');
            onSongChange({ trackUrl, trackTitle, trackEmoji, serverTime });
            await this.receiveStart(trackUrl, trackTitle, trackEmoji, serverTime);
        };

        const onPause = ({ positionMs }: any) => this.handlePause(positionMs);
        const onResume = ({ positionMs, serverTime }: any) => this.handleResume(positionMs, serverTime);
        const onSeek = ({ positionMs, serverTime }: any) => this.handleSeek(positionMs, serverTime);

        socket.on('sync:start', onSyncStart);
        socket.on('sync:pause', onPause);
        socket.on('sync:resume', onResume);
        socket.on('sync:seek', onSeek);

        return () => {
            socket.off('sync:start', onSyncStart);
            socket.off('sync:pause', onPause);
            socket.off('sync:resume', onResume);
            socket.off('sync:seek', onSeek);
        };
    }

    // ─── 15. VOLUME ──────────────────────────────────────
    async setVolume(volume: number): Promise<void> {
        if (!this.sound) return;
        try { await this.sound.setVolumeAsync(Math.max(0, Math.min(1, volume))); } catch { }
    }

    // ─── 16. DESTROY ─────────────────────────────────────
    async destroy(): Promise<void> {
        this._stopDriftCheck();
        if (this.sound) {
            try { await this.sound.stopAsync(); } catch { }
            try { await this.sound.unloadAsync(); } catch { }
            this.sound = null;
        }
    }

    // ─── SAFE PLAY HELPER ────────────────────────────────
    private async _safePlay(sound: Audio.Sound, retries = 3): Promise<void> {
        for (let i = 0; i < retries; i++) {
            try {
                await sound.playAsync();
                return;
            } catch (err: any) {
                if (err?.name === 'AbortError' || err?.message?.includes('AbortError')) {
                    console.warn(`⚠️ play() AbortError — retry ${i + 1}/${retries}`);
                    await new Promise(r => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
        console.error('❌ _safePlay failed after retries');
    }
}