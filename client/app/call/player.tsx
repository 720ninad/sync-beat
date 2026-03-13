import {
    View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useEffect, useState } from 'react';
import { Colors, CommonStyles } from '../../constants/Theme';
import { useWebRTC } from '../../src/lib/useWebRTC';
import { endCall } from '../../src/lib/call';
import { getSocket } from '../../src/lib/socket';
import { SyncEngine } from '../../src/lib/syncEngine';
import { getSyncEngine, setSyncEngine, clearSyncEngine } from '../../src/lib/syncEngineStore';
import { getMe } from '../../src/lib/auth';
import { saveCallSession, clearCallSession } from '../../src/lib/callSession';

function WaveBar({ delay }: { delay: number }) {
    const anim = useRef(new Animated.Value(0.2)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 375, useNativeDriver: true, delay }),
                Animated.timing(anim, { toValue: 0.2, duration: 375, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[s.waveBar, { transform: [{ scaleY: anim }], opacity: anim }]} />;
}

export default function PlayerScreen() {
    const router = useRouter();

    const {
        callId, name,
        isCaller: isCallerParam, targetId,
        trackTitle: initTrackTitle,
        trackEmoji: initTrackEmoji,
        trackUrl: initTrackUrl,
        durationMs, serverTime,
        pickerUserId: initPickerUserId,
    } = useLocalSearchParams<{
        callId: string; name: string; isCaller: string; targetId: string;
        trackTitle: string; trackEmoji: string; trackUrl: string;
        durationMs: string; serverTime: string; pickerUserId: string;
    }>();

    const isCaller = isCallerParam === 'true';
    const totalMs = parseInt(durationMs || '0') || 240000;
    const st = parseInt(serverTime || '0') || 0;

    const { isConnected, isMuted, toggleMute } = useWebRTC({
        callId: callId || '',
        targetId: targetId || '',
        isCaller,
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [positionMs, setPositionMs] = useState(0);
    const [loadedMs, setLoadedMs] = useState(totalMs);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLowVolume, setIsLowVolume] = useState(false);
    const [currentTitle, setCurrentTitle] = useState(initTrackTitle || 'Now Playing');
    const [currentEmoji, setCurrentEmoji] = useState(initTrackEmoji || '🎵');
    const [timelineWidth, setTimelineWidth] = useState(0);
    const [timelinePressed, setTimelinePressed] = useState(false);

    // Refs so socket handlers always have latest values
    const currentTitleRef = useRef(initTrackTitle || 'Now Playing');
    const currentEmojiRef = useRef(initTrackEmoji || '🎵');
    const currentUrlRef = useRef(initTrackUrl || '');
    const timelineRef = useRef<View>(null);

    const syncRef = useRef<SyncEngine | null>(null);
    const initDone = useRef(false);

    // Timeline PanResponder for both click and drag functionality
    const timelinePanResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
            return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
        },
        onPanResponderGrant: (evt) => {
            setTimelinePressed(true);
            const { locationX } = evt.nativeEvent;
            if (isFinite(locationX) && timelineWidth > 0 && loadedMs > 0) {
                const position = Math.max(0, Math.min(1, locationX / timelineWidth));
                if (isFinite(position)) {
                    const newPosition = position * loadedMs;
                    if (isFinite(newPosition)) {
                        setPositionMs(newPosition);
                    }
                }
            }
        },
        onPanResponderMove: (evt) => {
            const { locationX } = evt.nativeEvent;
            if (!isFinite(locationX) || timelineWidth <= 0 || loadedMs <= 0) return;
            const position = Math.max(0, Math.min(1, locationX / timelineWidth));
            if (isFinite(position)) {
                const newPosition = position * loadedMs;
                if (isFinite(newPosition)) {
                    setPositionMs(newPosition);
                }
            }
        },
        onPanResponderRelease: (evt) => {
            const { locationX } = evt.nativeEvent;
            if (!isFinite(locationX) || timelineWidth <= 0) {
                setTimelinePressed(false);
                return;
            }
            const position = Math.max(0, Math.min(1, locationX / timelineWidth));
            if (isFinite(position) && loadedMs > 0) {
                const newPositionMs = position * loadedMs;
                if (isFinite(newPositionMs)) {
                    syncRef.current?.seek(newPositionMs);
                }
            }
            setTimelinePressed(false);
        },
    });

    const updateTrackInfo = (title: string, emoji: string, url?: string) => {
        setCurrentTitle(title); currentTitleRef.current = title;
        setCurrentEmoji(emoji); currentEmojiRef.current = emoji;
        if (url) currentUrlRef.current = url;
    };

    // ─── SAVE SESSION ────────────────────────────────────
    useEffect(() => {
        saveCallSession({
            callId: callId || '',
            targetId: targetId || '',
            name: name || '',
            isCaller: isCallerParam || 'false',
            trackUrl: initTrackUrl,
            trackTitle: initTrackTitle,
            trackEmoji: initTrackEmoji,
            pickerUserId: initPickerUserId,
            screen: 'player',
        });
    }, [callId]);

    // ─── SETUP ENGINE ────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        let cleanupEvents: (() => void) | undefined;

        const setup = async () => {
            let myId = '';
            try {
                const data = await getMe();
                myId = data?.id || data?.user?.id || '';
            } catch { }

            if (cancelled) return;

            let engine = getSyncEngine();
            if (!engine) {
                engine = new SyncEngine(callId || '', myId, () => { });
                setSyncEngine(engine);
            }
            engine.myUserId = myId;

            engine.setStatusCallback((status) => {
                setIsPlaying(status.isPlaying);
                setPositionMs(status.positionMs);
                if (status.durationMs) setLoadedMs(status.durationMs);
                setIsLoaded(status.isLoaded);
            });

            syncRef.current = engine;

            // Listen for other user changing song
            cleanupEvents = engine.listenForEvents(({ trackUrl, trackTitle, trackEmoji }) => {
                updateTrackInfo(trackTitle, trackEmoji, trackUrl);
                setIsLoaded(false);
                setPositionMs(0);
            });

            // ── Listen for request-sync (peer reloaded, wants our state) ──
            const socket = getSocket();
            const onRequestSync = async ({ callId: reqCallId }: any) => {
                if (reqCallId !== callId) return;
                const eng = syncRef.current;
                if (!eng?.sound) return;
                try {
                    const status = await eng.sound.getStatusAsync();
                    if (!status.isLoaded) return;
                    socket?.emit('sync:state', {
                        callId,
                        trackUrl: currentUrlRef.current,
                        trackTitle: currentTitleRef.current,
                        trackEmoji: currentEmojiRef.current,
                        positionMs: status.positionMillis,
                        isPlaying: status.isPlaying,
                        pickerUserId: eng.myUserId,
                    });
                    console.log('📡 Sent sync:state to rejoining peer');
                } catch { }
            };

            // ── Listen for sync:state (I just reloaded, peer sent me their state) ──
            const onSyncState = async ({ trackUrl, trackTitle, trackEmoji, positionMs, isPlaying, serverTime, pickerUserId }: any) => {
                const eng = syncRef.current;
                if (!eng) return;
                // Skip if I sent this
                if (pickerUserId === eng.myUserId) return;
                console.log('📥 Received sync:state, resyncing...');
                updateTrackInfo(trackTitle, trackEmoji, trackUrl);
                setIsLoaded(false);
                setPositionMs(0);
                await eng.resyncFromState(trackUrl, trackTitle, trackEmoji, positionMs, isPlaying, serverTime);
            };

            socket?.on('call:request-sync', onRequestSync);
            socket?.on('sync:state', onSyncState);

            // ── Initial playback ──
            if (!initDone.current) {
                initDone.current = true;
                await engine.measureClockOffset();

                const iAmThePicker = initPickerUserId === myId;

                if (iAmThePicker && initTrackUrl) {
                    console.log('▶️ I am picker, playing from start');
                    await engine.playFromStart();
                } else if (initTrackUrl && st) {
                    console.log('📥 Other picked, syncing...');
                    await engine.receiveStart(
                        initTrackUrl,
                        initTrackTitle || '',
                        initTrackEmoji || '🎵',
                        st,
                    );
                }
                // If st === 0 (after reload), sync:state from peer will handle it
            }

            return () => {
                socket?.off('call:request-sync', onRequestSync);
                socket?.off('sync:state', onSyncState);
            };
        };

        let socketCleanup: (() => void) | undefined;
        setup().then(fn => { socketCleanup = fn; });

        return () => {
            cancelled = true;
            cleanupEvents?.();
            socketCleanup?.();
            clearSyncEngine();
            syncRef.current?.destroy();
        };
    }, [callId]);

    const handlePlayPause = async () => {
        const engine = syncRef.current;
        if (!engine) return;
        if (isPlaying) { await engine.pause(); }
        else { await engine.resume(); }
    };

    const handleToggleVolume = async () => {
        const engine = syncRef.current;
        if (!engine) return;
        const newLow = !isLowVolume;
        await engine.setVolume(newLow ? 0.3 : 1.0);
        setIsLowVolume(newLow);
    };

    const handleChangeSong = async () => {
        const engine = syncRef.current;
        if (engine && isPlaying) { await engine.pause(); }
        router.push({
            pathname: '/call/pick-song',
            params: { callId, name, isCaller: isCallerParam, targetId },
        });
    };

    const handleEndCall = () => {
        clearCallSession();
        endCall();
    };

    const formatTime = (ms: number) => {
        const secs = Math.floor(ms / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const progress = loadedMs > 0 ? positionMs / loadedMs : 0;
    const friendInitial = name?.charAt(0).toUpperCase() || '?';

    return (
        <View style={s.container}>

            <View style={s.header}>
                <View style={s.friendInfo}>
                    <View style={s.friendAvatar}>
                        <Text style={s.friendAvatarText}>{friendInitial}</Text>
                    </View>
                    <View>
                        <Text style={s.friendName}>{name || 'Friend'}</Text>
                        <View style={s.connRow}>
                            <View style={[s.connDot, { backgroundColor: isConnected ? '#2DD4BF' : '#FBBF24' }]} />
                            <Text style={[s.connText, { color: isConnected ? '#2DD4BF' : '#FBBF24' }]}>
                                {isConnected ? 'Voice connected' : 'Connecting...'}
                            </Text>
                        </View>
                    </View>
                </View>
                {isConnected && (
                    <View style={s.waves}>
                        {[0, 100, 200, 300, 400].map(d => <WaveBar key={d} delay={d} />)}
                    </View>
                )}
            </View>

            <View style={s.artSection}>
                <View style={s.artOuter}>
                    <View style={s.artInner}>
                        <Text style={s.artEmoji}>{currentEmoji}</Text>
                    </View>
                </View>
                <Text style={s.trackTitle}>{currentTitle}</Text>
                <Text style={s.trackArtist}>SyncBeat</Text>
                {!isLoaded && <Text style={s.loadingText}>⏳ Loading audio...</Text>}
            </View>

            <View style={s.progressSection}>
                <View style={s.progressTrack} {...timelinePanResponder.panHandlers}>
                    <View
                        ref={timelineRef}
                        style={s.progressContainer}
                        onLayout={(event) => {
                            const { width } = event.nativeEvent.layout;
                            setTimelineWidth(width);
                        }}
                    >
                        <View style={s.progressBackground}>
                            <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any }]} />
                            <View style={[
                                s.progressThumb,
                                timelinePressed && s.progressThumbPressed,
                                { left: `${Math.min(progress * 100, 97)}%` as any }
                            ]} />
                        </View>
                    </View>
                </View>
                <View style={s.timeRow}>
                    <Text style={s.timeText}>{formatTime(positionMs)}</Text>
                    <Text style={s.timeText}>{formatTime(loadedMs)}</Text>
                </View>
            </View>

            <View style={s.controls}>
                <TouchableOpacity
                    style={s.controlBtn} activeOpacity={0.7}
                    onPress={() => syncRef.current?.seek(Math.max(0, positionMs - 10000))}
                >
                    <Text style={{ fontSize: 26 }}>⏮</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[s.playBtn, !isLoaded && s.playBtnDisabled]}
                    onPress={handlePlayPause} activeOpacity={0.85} disabled={!isLoaded}
                >
                    <Text style={{ fontSize: 32 }}>{isPlaying ? '⏸' : '▶️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={s.controlBtn} activeOpacity={0.7}
                    onPress={() => syncRef.current?.seek(Math.min(loadedMs, positionMs + 10000))}
                >
                    <Text style={{ fontSize: 26 }}>⏭</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.changeSongBtn} onPress={handleChangeSong} activeOpacity={0.85}>
                <Text style={s.changeSongText}>🎵 Change Song</Text>
            </TouchableOpacity>

            <View style={s.bottomActions}>
                <View style={s.actionItem}>
                    <TouchableOpacity
                        style={[s.actionBtn, isMuted && s.actionBtnActive]}
                        onPress={toggleMute} activeOpacity={0.85}
                    >
                        <Text style={{ fontSize: 22 }}>{isMuted ? '🔇' : '🎙'}</Text>
                    </TouchableOpacity>
                    <Text style={s.actionLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                </View>

                <View style={s.actionItem}>
                    <TouchableOpacity style={s.endBtn} onPress={handleEndCall} activeOpacity={0.85}>
                        <Text style={{ fontSize: 22 }}>📵</Text>
                    </TouchableOpacity>
                    <Text style={s.actionLabel}>End Call</Text>
                </View>

                <View style={s.actionItem}>
                    <TouchableOpacity
                        style={[s.actionBtn, isLowVolume && s.actionBtnActive]}
                        onPress={handleToggleVolume} activeOpacity={0.85}
                    >
                        <Text style={{ fontSize: 22 }}>{isLowVolume ? '🔉' : '🔊'}</Text>
                    </TouchableOpacity>
                    <Text style={s.actionLabel}>{isLowVolume ? 'Low' : 'Loud'}</Text>
                </View>
            </View>

        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16,
    },
    friendInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    friendAvatar: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    friendAvatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
    friendName: { fontSize: 15, fontWeight: '700', color: Colors.text },
    connRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    connDot: { width: 7, height: 7, borderRadius: 4 },
    connText: { fontSize: 12 },
    waves: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    waveBar: { width: 3, height: 20, borderRadius: 2, backgroundColor: '#2DD4BF' },

    artSection: { alignItems: 'center', paddingVertical: 12, gap: 10 },
    artOuter: {
        width: 170, height: 170, borderRadius: 36,
        backgroundColor: 'rgba(123,110,255,0.1)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.3, shadowRadius: 40, elevation: 20,
    },
    artInner: {
        width: 130, height: 130, borderRadius: 28,
        backgroundColor: 'rgba(123,110,255,0.15)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.25)',
        alignItems: 'center', justifyContent: 'center',
    },
    artEmoji: { fontSize: 58 },
    trackTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    trackArtist: { fontSize: 13, color: Colors.textDim },
    loadingText: { fontSize: 13, color: Colors.textDim },

    progressSection: { paddingHorizontal: 24, gap: 8 },
    progressTrack: {
        paddingVertical: 8,
    },
    progressContainer: {
        width: '100%',
    },
    progressBackground: {
        height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
        position: 'relative', overflow: 'visible',
    },
    progressFill: { height: '100%', borderRadius: 2, backgroundColor: Colors.primary },
    progressThumb: {
        position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7,
        backgroundColor: Colors.primary, marginLeft: -7,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6, shadowRadius: 4, elevation: 4,
    },
    progressThumbPressed: {
        width: 18, height: 18, borderRadius: 9, top: -7, marginLeft: -9,
        shadowOpacity: 0.8, shadowRadius: 6,
    },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    timeText: { fontSize: 12, color: Colors.textMuted },

    controls: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 28, paddingVertical: 16,
    },
    controlBtn: {
        width: 52, height: 52, borderRadius: 16,
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    playBtn: {
        width: 68, height: 68, borderRadius: 22, backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
    },
    playBtnDisabled: { opacity: 0.5 },

    changeSongBtn: {
        alignSelf: 'center',
        backgroundColor: 'rgba(123,110,255,0.1)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.25)',
        borderRadius: 999, paddingVertical: 10, paddingHorizontal: 24, marginTop: 4,
    },
    changeSongText: { color: '#9B90FF', fontSize: 13, fontWeight: '700' },

    bottomActions: {
        flexDirection: 'row', justifyContent: 'center',
        gap: 36, paddingHorizontal: 24, paddingBottom: 32, marginTop: 'auto',
    },
    actionItem: { alignItems: 'center', gap: 8 },
    actionBtn: {
        width: 56, height: 56, borderRadius: 18,
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    actionBtnActive: {
        backgroundColor: 'rgba(123,110,255,0.15)',
        borderColor: 'rgba(123,110,255,0.3)',
    },
    actionLabel: { fontSize: 12, color: Colors.textDim, fontWeight: '500' },
    endBtn: {
        width: 56, height: 56, borderRadius: 18,
        backgroundColor: 'rgba(248,113,113,0.12)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#F87171', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
});