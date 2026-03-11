import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Animated, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Colors, CommonStyles } from '../../constants/Theme';
import { useWebRTC } from '../../src/lib/useWebRTC';
import { endCall } from '../../src/lib/call';
import { getSocket } from '../../src/lib/socket';
import { getMyTracks, getPublicTracks, formatDuration } from '../../src/lib/tracks';
import { SyncEngine } from '../../src/lib/syncEngine';
import { getSyncEngine, setSyncEngine } from '../../src/lib/syncEngineStore';
import { toast } from '../../src/lib/toast';
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

export default function PickSongScreen() {
    const router = useRouter();

    const { callId, name, username, isCaller: isCallerParam, targetId } =
        useLocalSearchParams<{
            callId: string; name: string; username: string;
            isCaller: string; targetId: string;
        }>();

    const isCaller = isCallerParam === 'true';

    const { isConnected, isMuted, toggleMute, error } = useWebRTC({
        callId: callId || '',
        targetId: targetId || '',
        isCaller,
    });

    const [tracks, setTracks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'my' | 'public'>('my');
    const [myUserId, setMyUserId] = useState('');

    const syncRef = useRef<SyncEngine | null>(null);
    const myUserRef = useRef('');

    // ─── SAVE SESSION ────────────────────────────────────
    useEffect(() => {
        saveCallSession({
            callId: callId || '',
            targetId: targetId || '',
            name: name || '',
            isCaller: isCallerParam || 'false',
            screen: 'pick-song',
        });
    }, [callId]);

    // ─── GET MY USER ID ──────────────────────────────────
    useEffect(() => {
        getMe().then((data: any) => {
            const id = data?.id || data?.user?.id || '';
            setMyUserId(id);
            myUserRef.current = id;
        }).catch(() => { });
    }, []);

    // ─── CREATE OR REUSE ENGINE ──────────────────────────
    useEffect(() => {
        const existing = getSyncEngine();
        if (existing) {
            syncRef.current = existing;
            console.log('♻️ Reusing existing SyncEngine');
        } else {
            const engine = new SyncEngine(callId || '', myUserId || 'unknown', () => { });
            setSyncEngine(engine);
            syncRef.current = engine;
            engine.measureClockOffset();
            console.log('🆕 Created new SyncEngine');
        }
    }, [callId]);

    // ─── UPDATE ENGINE USERID ────────────────────────────
    useEffect(() => {
        if (myUserId && syncRef.current) {
            syncRef.current.myUserId = myUserId;
        }
    }, [myUserId]);

    // ─── LISTEN FOR OTHER USER PICKING A SONG ────────────
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onSyncStart = ({ trackUrl, trackTitle, trackEmoji, serverTime, pickerUserId }: any) => {
            if (pickerUserId && pickerUserId === myUserRef.current) return;
            console.log('📥 Other user picked a song, navigating to player');
            router.push({
                pathname: '/call/player',
                params: {
                    callId,
                    name,
                    isCaller: isCallerParam,
                    targetId,
                    trackTitle: trackTitle || 'Now Playing',
                    trackEmoji: trackEmoji || '🎵',
                    trackUrl,
                    durationMs: '0',
                    serverTime: String(serverTime),
                    pickerUserId,
                },
            });
        };

        socket.on('sync:start', onSyncStart);
        return () => { socket.off('sync:start', onSyncStart); };
    }, [callId]);

    const loadTracks = async (tab: 'my' | 'public') => {
        setLoading(true);
        try {
            const data = tab === 'my' ? await getMyTracks() : await getPublicTracks();
            setTracks(data);
        } catch {
            toast.error('Failed to load tracks');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadTracks(activeTab); }, [activeTab]));

    const handleEndCall = () => {
        clearCallSession();
        endCall();
        router.replace('/(main)/home');
    };

    // ─── ANYONE CAN PICK ─────────────────────────────────
    const handlePickTrack = async (track: any) => {
        try {
            setStarting(track.id);
            const engine = syncRef.current!;
            if (myUserId) engine.myUserId = myUserId;

            await engine.loadTrack({
                url: track.fileUrl,
                title: track.title,
                emoji: '🎵',
                durationMs: (track.duration || 0) * 1000,
                trackId: track.id,
            });

            await engine.emitStart();

            router.push({
                pathname: '/call/player',
                params: {
                    callId,
                    name,
                    isCaller: isCallerParam,
                    targetId,
                    trackTitle: track.title,
                    trackEmoji: '🎵',
                    trackUrl: track.fileUrl,
                    durationMs: String((track.duration || 0) * 1000),
                    pickerUserId: myUserId || myUserRef.current,
                },
            });
        } catch (err) {
            console.error('Pick track error:', err);
            toast.error('Failed to load track');
            setStarting(null);
        }
    };

    const friendInitial = name?.charAt(0).toUpperCase() || '?';

    return (
        <View style={s.container}>

            <View style={s.callHeader}>
                <View style={s.callInfo}>
                    <View style={s.miniAvatar}>
                        <Text style={s.miniAvatarText}>{friendInitial}</Text>
                    </View>
                    <View>
                        <Text style={s.callName}>{name || 'Friend'}</Text>
                        <View style={s.connectedRow}>
                            <View style={[s.connDot, { backgroundColor: isConnected ? '#2DD4BF' : '#FBBF24' }]} />
                            <Text style={[s.connText, { color: isConnected ? '#2DD4BF' : '#FBBF24' }]}>
                                {isConnected ? 'Voice connected' : 'Connecting voice...'}
                            </Text>
                        </View>
                    </View>
                </View>
                {isConnected && (
                    <View style={s.waveRow}>
                        {[0, 100, 200, 300, 400].map(d => <WaveBar key={d} delay={d} />)}
                    </View>
                )}
            </View>

            <View style={s.voiceBar}>
                <Text style={{ fontSize: 14 }}>{isMuted ? '🔇' : '🎙'}</Text>
                <Text style={s.voiceBarText}>
                    {error ? `⚠️ ${error}` : isConnected
                        ? 'Voice active — both can hear each other'
                        : 'Setting up voice...'}
                </Text>
                <TouchableOpacity
                    style={[s.muteBtn, isMuted && s.muteBtnActive]}
                    onPress={toggleMute} activeOpacity={0.85}
                >
                    <Text style={s.muteBtnText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>
            </View>

            <View style={s.banner}>
                <Text style={s.bannerTitle}>🎵 Pick a song to play</Text>
                <Text style={s.bannerSub}>Both of you will hear it at the exact same time</Text>
            </View>

            <View style={s.libTabs}>
                {(['my', 'public'] as const).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[s.libTab, activeTab === t && s.libTabActive]}
                        onPress={() => setActiveTab(t)}
                        activeOpacity={0.85}
                    >
                        <Text style={[s.libTabText, activeTab === t && s.libTabTextActive]}>
                            {t === 'my' ? 'My Tracks' : 'Free Library'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            ) : tracks.length === 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 36 }}>🎵</Text>
                    <Text style={s.emptyText}>No tracks found</Text>
                    <Text style={s.emptyDesc}>Upload tracks in your Library first</Text>
                </View>
            ) : (
                <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
                    {tracks.map((track, i) => (
                        <TouchableOpacity
                            key={track.id}
                            style={[s.trackRow, i < tracks.length - 1 && s.trackBorder]}
                            onPress={() => handlePickTrack(track)}
                            activeOpacity={0.8}
                            disabled={!!starting}
                        >
                            <View style={s.trackIcon}>
                                <Text style={{ fontSize: 20 }}>🎵</Text>
                            </View>
                            <View style={s.trackInfo}>
                                <Text style={s.trackTitle}>{track.title}</Text>
                                <Text style={s.trackDuration}>
                                    {track.artist}{track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                                </Text>
                            </View>
                            {starting === track.id ? (
                                <ActivityIndicator color={Colors.primary} size="small" />
                            ) : (
                                <View style={s.playBtnOutline}>
                                    <Text style={s.playBtnText}>Play</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            <View style={s.bottomRow}>
                <TouchableOpacity style={s.endBtn} onPress={handleEndCall} activeOpacity={0.85}>
                    <Text style={{ fontSize: 22 }}>📵</Text>
                </TouchableOpacity>
            </View>

        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

    callHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', padding: 24, paddingTop: 28,
    },
    callInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    miniAvatar: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    miniAvatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
    callName: { fontSize: 15, fontWeight: '700', color: Colors.text },
    connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    connDot: { width: 7, height: 7, borderRadius: 4 },
    connText: { fontSize: 12 },
    waveRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    waveBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#2DD4BF' },

    voiceBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 24, marginBottom: 16,
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 14, padding: 12, paddingHorizontal: 16,
    },
    voiceBarText: { flex: 1, fontSize: 12, color: Colors.textDim },
    muteBtn: {
        backgroundColor: Colors.input, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14,
    },
    muteBtnActive: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)' },
    muteBtnText: { fontSize: 12, fontWeight: '700', color: Colors.text },

    banner: {
        marginHorizontal: 24, marginBottom: 16, padding: 18,
        backgroundColor: 'rgba(123,110,255,0.1)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        borderRadius: 18, alignItems: 'center',
    },
    bannerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 5 },
    bannerSub: { fontSize: 13, color: Colors.textDim, textAlign: 'center' },

    libTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginBottom: 10 },
    libTab: {
        flex: 1, paddingVertical: 8, backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border, borderRadius: 999, alignItems: 'center',
    },
    libTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    libTabText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
    libTabTextActive: { color: '#fff' },

    scroll: { flex: 1 },
    trackRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 24, paddingVertical: 14,
    },
    trackBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
    trackIcon: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: 'rgba(123,110,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    trackInfo: { flex: 1 },
    trackTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
    trackDuration: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    playBtnOutline: {
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.3)',
        borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16,
    },
    playBtnText: { color: '#9B90FF', fontSize: 13, fontWeight: '600' },
    emptyText: { fontSize: 16, fontWeight: '700', color: Colors.text },
    emptyDesc: { fontSize: 13, color: Colors.textDim },

    bottomRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 24, paddingBottom: 36,
    },
    endBtn: {
        width: 52, height: 52, borderRadius: 16,
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
});