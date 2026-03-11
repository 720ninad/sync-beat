import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Colors } from '../../constants/Theme';
import { cleanupWebRTC } from '../../src/lib/webrtc';
import { clearCallSession } from '../../src/lib/callSession';

export default function CallEndedScreen() {
    const router = useRouter();

    const { durationSecs, endedBy, trackTitle, trackEmoji } = useLocalSearchParams<{
        durationSecs: string;
        endedBy: string;
        trackTitle: string;
        trackEmoji: string;
    }>();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        cleanupWebRTC();
        clearCallSession();

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
    }, []);

    const formatDuration = (secs: string) => {
        const s = parseInt(secs || '0');
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const r = s % 60;
        return r > 0 ? `${m}m ${r}s` : `${m}m`;
    };

    const hasTrack = trackTitle && trackTitle !== 'undefined' && trackTitle !== 'None';

    const stats = [
        { label: 'Duration', value: formatDuration(durationSecs), icon: '⏱' },
        { label: 'Ended by', value: endedBy || 'Unknown', icon: '👤' },
        { label: 'Song played', value: hasTrack ? trackTitle : 'None', icon: hasTrack ? (trackEmoji || '🎵') : '🔇' },
        { label: 'Call type', value: 'Voice + Music Sync', icon: '🎶' },
    ];

    return (
        <View style={s.container}>
            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                <Animated.View style={[s.content, {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                }]}>

                    {/* Icon */}
                    <View style={s.iconSection}>
                        <View style={s.iconOuter}>
                            <View style={s.iconInner}>
                                <Text style={{ fontSize: 40 }}>📴</Text>
                            </View>
                        </View>
                        <Text style={s.title}>Call Ended</Text>
                        <Text style={s.subtitle}>Hope you enjoyed the session! 🎶</Text>
                    </View>

                    {/* Stats card */}
                    <View style={s.statsCard}>
                        {stats.map((stat, i) => (
                            <View key={stat.label}>
                                <View style={s.statRow}>
                                    <View style={s.statLeft}>
                                        <Text style={s.statIcon}>{stat.icon}</Text>
                                        <Text style={s.statLabel}>{stat.label}</Text>
                                    </View>
                                    <Text style={s.statValue} numberOfLines={1}>{stat.value}</Text>
                                </View>
                                {i < stats.length - 1 && <View style={s.statDivider} />}
                            </View>
                        ))}
                    </View>

                    {/* Buttons */}
                    <View style={s.buttons}>
                        <TouchableOpacity
                            style={s.btnPrimary}
                            onPress={() => router.replace('/(main)/home')}
                            activeOpacity={0.85}
                        >
                            <Text style={s.btnPrimaryText}>🏠 Back to Home</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={s.btnSecondary}
                            onPress={() => router.replace('/(main)/library')}
                            activeOpacity={0.85}
                        >
                            <Text style={s.btnSecondaryText}>🎵 Browse Library</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={s.btnGhost}
                            onPress={() => {
                                router.replace('/(main)/profile');
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={s.btnGhostText}>🕘 View Listen History</Text>
                        </TouchableOpacity>
                    </View>

                </Animated.View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 60 },
    content: { gap: 28, alignItems: 'center' },

    iconSection: { alignItems: 'center', gap: 14 },
    iconOuter: {
        width: 120, height: 120, borderRadius: 40,
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    iconInner: {
        width: 84, height: 84, borderRadius: 28,
        backgroundColor: 'rgba(248,113,113,0.12)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginTop: 4 },
    subtitle: { fontSize: 15, color: Colors.textDim, textAlign: 'center' },

    statsCard: {
        width: '100%', backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 20, padding: 8,
    },
    statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    statLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statIcon: { fontSize: 20 },
    statLabel: { fontSize: 14, color: Colors.textDim, fontWeight: '500' },
    statValue: { fontSize: 15, color: Colors.text, fontWeight: '700', maxWidth: 160 },
    statDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

    buttons: { width: '100%', gap: 12 },
    btnPrimary: {
        backgroundColor: Colors.primary,
        borderRadius: 999, padding: 16, alignItems: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
    btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    btnSecondary: {
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, padding: 16, alignItems: 'center',
    },
    btnSecondaryText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
    btnGhost: {
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.25)',
        borderRadius: 999, padding: 16, alignItems: 'center',
    },
    btnGhostText: { color: '#9B90FF', fontSize: 15, fontWeight: '600' },
});