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

// ─── Structured logger — filter by "[SYNC]" in console ───
const log = {
    info: (msg: string, data?: any) => console.log(`[SYNC] ℹ️  ${msg}`, data ?? ''),
    ok: (msg: string, data?: any) => console.log(`[SYNC] ✅ ${msg}`, data ?? ''),
    warn: (msg: string, data?: any) => console.warn(`[SYNC] ⚠️  ${msg}`, data ?? ''),
    error: (msg: string, data?: any) => console.error(`[SYNC] ❌ ${msg}`, data ?? ''),
    clock: (msg: string, data?: any) => console.log(`[SYNC] ⏱  ${msg}`, data ?? ''),
    play: (msg: string, data?: any) => console.log(`[SYNC] ▶️  ${msg}`, data ?? ''),
    pause: (msg: string, data?: any) => console.log(`[SYNC] ⏸  ${msg}`, data ?? ''),
    seek: (msg: string, data?: any) => console.log(`[SYNC] ⏩ ${msg}`, data ?? ''),
    drift: (msg: string, data?: any) => console.log(`[SYNC] 🔧 ${msg}`, data ?? ''),
    net: (msg: string, data?: any) => console.log(`[SYNC] 📡 ${msg}`, data ?? ''),
};

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
    // 2000ms gives YouTube streams enough time to load on slow connections
    private static readonly SCHEDULE_AHEAD_MS = 2000;
    // Drift correction threshold — nudge if off by more than this
    private static readonly DRIFT_THRESHOLD_MS = 150;
    // Drift correction interval
    private static readonly DRIFT_CHECK_INTERVAL_MS = 3000;

    constructor(callId: string, myUserId: string, onStatus: OnStatusUpdate) {
        this.callId = callId;
        this.myUserId = myUserId;
        this.onStatus = onStatus;
        log.info('SyncEngine created', { callId, myUserId });
    }

    setStatusCallback(cb: OnStatusUpdate) {
        this.onStatus = cb;
    }

    // ─── 1. CLOCK OFFSET (averaged over N samples) ───────
    async measureClockOffset(samples = 5): Promise<number> {
        const socket = getSocket();
        if (!socket) {
            log.warn('measureClockOffset: no socket, offset=0');
            return 0;
        }

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
                    log.clock(`sample ${i + 1}/${samples}: rtt=${rtt}ms offset=${Math.round(o)}ms`);
                    resolve(o);
                };
                socket.once('sync:pong', handler);
                setTimeout(() => { socket.off('sync:pong', handler); resolve(0); }, 2000);
            });
            offsets.push(offset);
            if (i < samples - 1) await new Promise(r => setTimeout(r, 100));
        }

        // Discard outliers — use median
        offsets.sort((a, b) => a - b);
        const median = offsets[Math.floor(offsets.length / 2)];
        this.clockOffset = median;
        log.clock(`FINAL offset=${Math.round(median)}ms  all=[${offsets.map(o => Math.round(o)).join(', ')}]`);
        return median;
    }

    serverNow(): number {
        return Date.now() + this.clockOffset;
    }

    // ─── 2. LOAD TRACK ───────────────────────────────────
    async loadTrack(track: SyncTrack): Promise<void> {
        log.info(`loadTrack: "${track.title}" url=${track.url.slice(0, 60)}...`);
        const t0 = Date.now();
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
        log.ok(`loadTrack done in ${Date.now() - t0}ms: "${track.title}"`);
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
        const startAt = this.serverNow() + SyncEngine.SCHEDULE_AHEAD_MS;
        const msFromNow = startAt - this.serverNow();
        getSocket()?.emit('sync:start', {
            callId: this.callId,
            trackUrl: this.track.url,
            trackTitle: this.track.title,
            trackEmoji: this.track.emoji,
            trackId: this.track.trackId,
            serverTime: startAt,
            pickerUserId: this.myUserId,
        });
        log.net(`emitStart: scheduled in ${msFromNow}ms (serverTime=${startAt})`);
        return startAt;
    }

    // ─── 4. PICKER: PLAY AT SCHEDULED TIME ───────────────
    async playFromStart(scheduledServerTime?: number): Promise<void> {
        if (!this.sound) {
            log.error('playFromStart: no sound loaded');
            return;
        }
        try {
            await this.sound.setPositionAsync(0);
            const startAt = scheduledServerTime ?? this.serverNow();
            const delayMs = Math.max(0, startAt - this.serverNow());
            log.play(`PICKER: waiting ${Math.round(delayMs)}ms until scheduled start (serverTime=${startAt})`);
            if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            await this._safePlay(this.sound);
            this.playStartServerTime = startAt;
            this.isPaused = false;
            log.play(`PICKER: playing now — playStartServerTime=${startAt}`);
            this._startDriftCheck();
        } catch (err) { log.error('playFromStart failed', err); }
    }

    // ─── 5. RECEIVER: LOAD THEN PLAY AT SCHEDULED TIME ───
    async receiveStart(trackUrl: string, trackTitle: string, trackEmoji: string, scheduledServerTime: number): Promise<void> {
        log.info(`receiveStart: scheduledServerTime=${scheduledServerTime} serverNow=${this.serverNow()}`);
        const loadStart = Date.now();
        try {
            await this.loadTrack({ url: trackUrl, title: trackTitle, emoji: trackEmoji, durationMs: 0 });
        } catch (err) {
            log.error('receiveStart: loadTrack failed', err);
            return;
        }
        const loadMs = Date.now() - loadStart;
        const delayMs = scheduledServerTime - this.serverNow();
        log.info(`receiveStart: load took ${loadMs}ms, time remaining until start=${Math.round(delayMs)}ms`);

        if (delayMs > 0) {
            log.play(`RECEIVER: on time — waiting ${Math.round(delayMs)}ms then playing from 0`);
            await new Promise(r => setTimeout(r, delayMs));
            try {
                await this.sound!.setPositionAsync(0);
                await this._safePlay(this.sound!);
                this.playStartServerTime = scheduledServerTime;
                log.ok(`RECEIVER: playing from 0 — playStartServerTime=${scheduledServerTime}`);
            } catch (err) { log.error('receiveStart play error', err); }
        } else {
            const catchUpMs = Math.abs(delayMs);
            log.warn(`RECEIVER: late by ${Math.round(catchUpMs)}ms — seeking to catch up`);
            try {
                await this.sound!.setPositionAsync(catchUpMs);
                await this._safePlay(this.sound!);
                // Anchor to actual position, NOT original scheduled time
                this.playStartServerTime = this.serverNow() - catchUpMs;
                log.ok(`RECEIVER: playing from ${Math.round(catchUpMs)}ms — playStartServerTime=${this.playStartServerTime}`);
            } catch (err) { log.error('receiveStart catchup error', err); }
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
        log.info('resyncFromState', { positionMs: Math.round(positionMs), isPlaying, serverTime });
        try {
            await this.loadTrack({ url: trackUrl, title: trackTitle, emoji: trackEmoji, durationMs: 0 });
        } catch (err) {
            log.error('resyncFromState: loadTrack failed', err);
            return;
        }
        if (isPlaying) {
            const elapsed = Math.max(0, this.serverNow() - serverTime);
            const seekTo = positionMs + elapsed;
            log.play(`resyncFromState: elapsed=${Math.round(elapsed)}ms seekTo=${Math.round(seekTo)}ms`);
            try {
                await this.sound!.setPositionAsync(seekTo);
                await new Promise(r => setTimeout(r, 100));
                await this._safePlay(this.sound!);
                this.playStartServerTime = this.serverNow() - seekTo;
                this.isPaused = false;
                this._startDriftCheck();
                log.ok(`resyncFromState: playing at ${Math.round(seekTo)}ms — playStartServerTime=${this.playStartServerTime}`);
            } catch (err) { log.error('resyncFromState play error', err); }
        } else {
            log.info(`resyncFromState: paused at ${Math.round(positionMs)}ms`);
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
        log.pause(`LOCAL pause at ${Math.round(positionMs)}ms`);
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
        log.play(`LOCAL resume from ${Math.round(positionMs)}ms — playStartServerTime=${this.playStartServerTime}`);
    }

    // ─── 9. SEEK ─────────────────────────────────────────
    async seek(positionMs: number): Promise<void> {
        if (!this.sound) return;
        const serverTime = this.serverNow();
        await this.sound.setPositionAsync(positionMs);
        this.playStartServerTime = serverTime - positionMs;
        if (this.isPaused) this.pausedAtMs = positionMs;
        getSocket()?.emit('sync:seek', { callId: this.callId, positionMs, serverTime });
        log.seek(`LOCAL seek to ${Math.round(positionMs)}ms — playStartServerTime=${this.playStartServerTime}`);
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
            log.pause(`REMOTE pause at ${Math.round(positionMs)}ms`);
        } catch { }
    }

    // ─── 11. HANDLE INCOMING RESUME ──────────────────────
    async handleResume(positionMs: number, serverTime: number): Promise<void> {
        if (!this.sound) return;
        const elapsed = Math.max(0, this.serverNow() - serverTime);
        const seekTo = positionMs + elapsed;
        log.play(`REMOTE resume: positionMs=${Math.round(positionMs)} elapsed=${Math.round(elapsed)}ms seekTo=${Math.round(seekTo)}ms`);
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
        log.seek(`REMOTE seek: positionMs=${Math.round(positionMs)} elapsed=${Math.round(elapsed)}ms seekTo=${Math.round(seekTo)}ms isPaused=${this.isPaused}`);
        try {
            await this.sound.setPositionAsync(seekTo);
            this.playStartServerTime = serverTime - positionMs;
            if (this.isPaused) this.pausedAtMs = positionMs;
        } catch { }
    }

    // ─── 13. DRIFT CORRECTION ────────────────────────────
    // Runs every 3s after a 2s stabilization delay.
    // If drift > 150ms, hard-seeks to expected position.
    private _startDriftCheck(initialDelayMs = 2000) {
        this._stopDriftCheck();
        log.drift(`drift check armed — first check in ${initialDelayMs}ms, then every ${SyncEngine.DRIFT_CHECK_INTERVAL_MS}ms`);
        setTimeout(() => {
            if (this.isPaused) {
                log.drift('drift check cancelled — paused during initial delay');
                return;
            }
            this.driftTimer = setInterval(async () => {
                if (!this.sound || this.isPaused || !this.playStartServerTime) return;
                const status = await this.sound.getStatusAsync();
                if (!status.isLoaded || !status.isPlaying) return;

                const expectedMs = this.serverNow() - this.playStartServerTime;
                const actualMs = status.positionMillis;
                const drift = actualMs - expectedMs;

                if (Math.abs(drift) < SyncEngine.DRIFT_THRESHOLD_MS) {
                    log.drift(`OK — actual=${Math.round(actualMs)}ms expected=${Math.round(expectedMs)}ms drift=${Math.round(drift)}ms`);
                    return;
                }

                log.drift(`CORRECTING — actual=${Math.round(actualMs)}ms expected=${Math.round(expectedMs)}ms drift=${Math.round(drift)}ms`);
                try { await this.sound.setPositionAsync(expectedMs); } catch { }
            }, SyncEngine.DRIFT_CHECK_INTERVAL_MS);
        }, initialDelayMs);
    }

    private _stopDriftCheck() {
        if (this.driftTimer) {
            clearInterval(this.driftTimer);
            this.driftTimer = null;
            log.drift('drift check stopped');
        }
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
                log.info('sync:start — skipping own event');
                return;
            }
            log.net(`sync:start received — picker=${pickerUserId} scheduledAt=${serverTime} title="${trackTitle}"`);
            onSongChange({ trackUrl, trackTitle, trackEmoji, serverTime });
            await this.receiveStart(trackUrl, trackTitle, trackEmoji, serverTime);
        };

        const onPause = ({ positionMs }: any) => {
            log.net(`sync:pause received — positionMs=${Math.round(positionMs)}`);
            this.handlePause(positionMs);
        };
        const onResume = ({ positionMs, serverTime }: any) => {
            log.net(`sync:resume received — positionMs=${Math.round(positionMs)} serverTime=${serverTime}`);
            this.handleResume(positionMs, serverTime);
        };
        const onSeek = ({ positionMs, serverTime }: any) => {
            log.net(`sync:seek received — positionMs=${Math.round(positionMs)} serverTime=${serverTime}`);
            this.handleSeek(positionMs, serverTime);
        };

        socket.on('sync:start', onSyncStart);
        socket.on('sync:pause', onPause);
        socket.on('sync:resume', onResume);
        socket.on('sync:seek', onSeek);

        log.info('listenForEvents: registered sync:start/pause/resume/seek handlers');

        return () => {
            socket.off('sync:start', onSyncStart);
            socket.off('sync:pause', onPause);
            socket.off('sync:resume', onResume);
            socket.off('sync:seek', onSeek);
            log.info('listenForEvents: unregistered handlers');
        };
    }

    // ─── 15. VOLUME ──────────────────────────────────────
    async setVolume(volume: number): Promise<void> {
        if (!this.sound) return;
        try { await this.sound.setVolumeAsync(Math.max(0, Math.min(1, volume))); } catch { }
    }

    // ─── 16. DESTROY ─────────────────────────────────────
    async destroy(): Promise<void> {
        log.info('destroy called');
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
                    log.warn(`_safePlay AbortError — retry ${i + 1}/${retries}`);
                    await new Promise(r => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
        log.error('_safePlay failed after all retries');
    }
}
