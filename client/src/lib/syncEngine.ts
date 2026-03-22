import { Audio, AVPlaybackStatus } from 'expo-av';
import { getSocket } from './socket';

export type SyncRole = 'host' | 'listener';

export interface SyncTrack {
    url: string;
    title: string;
    emoji: string;
    durationMs: number;
    trackId?: string;
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

    // Clock sync — averaged over multiple samples for accuracy
    clockOffset: number = 0;

    onStatus: OnStatusUpdate;
    private track: SyncTrack | null = null;

    private playStartServerTime: number = 0;
    private pausedAtMs: number = 0;
    private isPaused: boolean = true;

    private driftTimer: ReturnType<typeof setInterval> | null = null;

    // How far ahead to schedule playback start (gives both clients time to buffer)
    private static readonly SCHEDULE_AHEAD_MS = 800;
    // Extra buffer for YouTube streams which need more time to start
    private static readonly SCHEDULE_AHEAD_MS_YOUTUBE = 5000;
    // Drift correction threshold — nudge if off by more than this
    private static readonly DRIFT_THRESHOLD_MS = 150;
    // Drift correction interval
    private static readonly DRIFT_CHECK_INTERVAL_MS = 3000;

    constructor(callId: string, myUserId: string, onStatus: OnStatusUpdate) {
        this.callId = callId;
        this.myUserId = myUserId;
        this.onStatus = onStatus;
    }

    setStatusCallback(cb: OnStatusUpdate) {
        this.onStatus = cb;
    }

    // ─── 1. CLOCK OFFSET (averaged over N samples) ───────
    async measureClockOffset(samples = 5): Promise<number> {
        const socket = getSocket();
        if (!socket) return 0;

        const offsets: number[] = [];

        for (let i = 0; i < samples; i++) {
            const offset = await new Promise<number>((resolve) => {
                const t0 = Date.now();
                socket.emit('sync:ping', { clientTime: t0 });
                const handler = ({ clientTime, serverTime }: any) => {
                    const t1 = Date.now();
                    const rtt = t1 - clientTime;
                    // Cristian's algorithm: offset = serverTime - (t0 + rtt/2)
                    const o = serverTime - (clientTime + rtt / 2);
                    resolve(o);
                };
                socket.once('sync:pong', handler);
                setTimeout(() => { socket.off('sync:pong', handler); resolve(0); }, 2000);
            });
            offsets.push(offset);
            // Small gap between samples to avoid burst
            if (i < samples - 1) await new Promise(r => setTimeout(r, 100));
        }

        // Discard outliers — use median
        offsets.sort((a, b) => a - b);
        const median = offsets[Math.floor(offsets.length / 2)];
        this.clockOffset = median;
        console.log(`⏱ Clock offset: ${median}ms  samples: [${offsets.join(', ')}]`);
        return median;
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
            { shouldPlay: false, positionMillis: 0, progressUpdateIntervalMillis: 100 },
            this._onPlaybackStatus,
        );
        this.sound = sound;

        // Explicitly notify that track is loaded so UI unblocks immediately
        this.onStatus({
            isPlaying: false,
            positionMs: 0,
            durationMs: track.durationMs ?? 0,
            isLoaded: true,
        });

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

    // ─── 3. EMIT START (scheduled future time) ───────────
    // Returns the scheduled server time so the picker can pass it to playFromStart()
    async emitStart(): Promise<number> {
        if (!this.track) return 0;
        await this.measureClockOffset();
        // Use a longer schedule window for YouTube streams (need time to buffer)
        const isYouTube = this.track.url.includes('/stream/');
        const aheadMs = isYouTube ? SyncEngine.SCHEDULE_AHEAD_MS_YOUTUBE : SyncEngine.SCHEDULE_AHEAD_MS;
        const startAt = this.serverNow() + aheadMs;
        getSocket()?.emit('sync:start', {
            callId: this.callId,
            trackUrl: this.track.url,
            trackTitle: this.track.title,
            trackEmoji: this.track.emoji,
            trackId: this.track.trackId,
            serverTime: startAt,       // future scheduled time
            pickerUserId: this.myUserId,
        });
        console.log(`📡 sync:start scheduled for T+${aheadMs}ms (serverTime=${startAt})`);
        return startAt;
    }

    // ─── 4. PICKER: PLAY AT SCHEDULED TIME ───────────────
    async playFromStart(scheduledServerTime?: number): Promise<void> {
        if (!this.sound) return;
        try {
            await this.sound.setPositionAsync(0);
            const startAt = scheduledServerTime ?? this.serverNow();
            const delayMs = Math.max(0, startAt - this.serverNow());
            console.log(`▶️ Picker playing in ${delayMs}ms`);
            if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            await this._safePlay(this.sound);
            this.playStartServerTime = startAt;
            this.isPaused = false;
            this._startDriftCheck();
        } catch (err) { console.error('playFromStart error:', err); }
    }

    // ─── 5. RECEIVER: LOAD THEN PLAY AT SCHEDULED TIME ───
    async receiveStart(trackUrl: string, trackTitle: string, trackEmoji: string, scheduledServerTime: number): Promise<void> {
        console.log('📥 receiveStart scheduledAt=', scheduledServerTime);
        try {
            // Load first — this takes time
            await this.loadTrack({ url: trackUrl, title: trackTitle, emoji: trackEmoji, durationMs: 0 });
        } catch (err) {
            console.error('receiveStart loadTrack failed:', err);
            return;
        }

        const delayMs = scheduledServerTime - this.serverNow();

        if (delayMs > 0) {
            // We have time — wait then play from 0
            console.log(`⏳ Waiting ${delayMs}ms to start in sync`);
            await new Promise(r => setTimeout(r, delayMs));
            try {
                await this.sound!.setPositionAsync(0);
                await this._safePlay(this.sound!);
                this.playStartServerTime = scheduledServerTime;
            } catch (err) { console.error('receiveStart play error:', err); }
        } else {
            // We're late — seek to catch up
            const catchUpMs = Math.abs(delayMs);
            console.log(`⚡ Late by ${catchUpMs}ms — seeking to catch up`);
            try {
                await this.sound!.setPositionAsync(catchUpMs);
                await this._safePlay(this.sound!);
                this.playStartServerTime = scheduledServerTime;
            } catch (err) { console.error('receiveStart catchup error:', err); }
        }

        this.isPaused = false;
        this._startDriftCheck();
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
                await new Promise(r => setTimeout(r, 100));
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

    // ─── 13. DRIFT CORRECTION ────────────────────────────
    // Runs every 3s. If drift > 150ms, nudge position.
    // Uses rate adjustment (setRateAsync) when available to avoid jarring seeks.
    private _startDriftCheck() {
        this._stopDriftCheck();
        this.driftTimer = setInterval(async () => {
            if (!this.sound || this.isPaused || !this.playStartServerTime) return;
            const status = await this.sound.getStatusAsync();
            if (!status.isLoaded || !status.isPlaying) return;

            const expectedMs = this.serverNow() - this.playStartServerTime;
            const actualMs = status.positionMillis;
            const drift = actualMs - expectedMs;

            if (Math.abs(drift) < SyncEngine.DRIFT_THRESHOLD_MS) return;

            console.log(`🔧 Drift ${drift > 0 ? '+' : ''}${drift}ms — correcting`);

            if (Math.abs(drift) > 2000) {
                // Large drift — hard seek
                try { await this.sound.setPositionAsync(expectedMs); } catch { }
            } else {
                // Small drift — soft seek (less jarring)
                try { await this.sound.setPositionAsync(expectedMs); } catch { }
            }
        }, SyncEngine.DRIFT_CHECK_INTERVAL_MS);
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
            console.log('📥 Other user picked song, scheduled at', serverTime);
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
