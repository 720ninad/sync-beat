import {
    View, Text, StyleSheet, TouchableOpacity, Animated
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Colors } from '../../constants/Theme';
import { acceptCall, declineCall, getSocket } from '../../src/lib/call';

export default function IncomingCallScreen() {
    const router = useRouter();
    const { callId, callerId, name, username } = useLocalSearchParams<{
        callId: string;
        callerId: string;
        name: string;
        username: string;
    }>();

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1, duration: 400, useNativeDriver: true,
        }).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const handleCancelled = ({ callId: cId }: any) => {
            if (cId === callId) router.replace('/(main)/home');
        };
        const handleMissed = ({ callId: cId }: any) => {
            if (cId === callId) router.replace('/(main)/home');
        };

        socket.on('call:cancelled', handleCancelled);
        socket.on('call:missed', handleMissed);

        return () => {
            socket.off('call:cancelled', handleCancelled);
            socket.off('call:missed', handleMissed);
        };
    }, [callId]);

    const handleAccept = () => {
        acceptCall(callId);
        router.replace({
            pathname: '/call/pick-song',
            params: {
                callId,
                name,
                username,
                isCaller: 'false',
                targetId: callerId, // target is the caller
            },
        });
    };

    const handleDecline = () => {
        declineCall(callId);
        router.replace('/(main)/home');
    };

    const friendInitial = name?.charAt(0).toUpperCase() || '?';

    return (
        <Animated.View style={[s.container, { opacity: fadeAnim }]}>
            <View style={s.topSection}>
                <Text style={s.incomingLabel}>Incoming Call</Text>
                <Text style={s.fromText}>from</Text>

                <Animated.View style={[s.avatarOuter, { transform: [{ scale: pulseAnim }] }]}>
                    <View style={s.avatarMiddle}>
                        <View style={s.avatarInner}>
                            <Text style={s.avatarText}>{friendInitial}</Text>
                        </View>
                    </View>
                </Animated.View>

                <Text style={s.callerName}>{name || 'Unknown'}</Text>
                <Text style={s.callerUsername}>@{username || '...'}</Text>

                <View style={s.ringingRow}>
                    <View style={s.ringingDot} />
                    <Text style={s.ringingText}>Ringing...</Text>
                </View>
            </View>

            <View style={s.actions}>
                <View style={s.actionItem}>
                    <TouchableOpacity style={s.declineBtn} onPress={handleDecline} activeOpacity={0.85}>
                        <Text style={{ fontSize: 28 }}>📵</Text>
                    </TouchableOpacity>
                    <Text style={s.actionLabel}>Decline</Text>
                </View>
                <View style={s.actionItem}>
                    <TouchableOpacity style={s.acceptBtn} onPress={handleAccept} activeOpacity={0.85}>
                        <Text style={{ fontSize: 28 }}>📞</Text>
                    </TouchableOpacity>
                    <Text style={s.actionLabel}>Accept</Text>
                </View>
            </View>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: Colors.bg,
        justifyContent: 'space-between',
        paddingVertical: 60, paddingHorizontal: 24,
    },
    topSection: { alignItems: 'center', gap: 12, paddingTop: 20 },
    incomingLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: Colors.textMuted },
    fromText: { fontSize: 14, color: Colors.textDim },
    avatarOuter: {
        width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(45,212,191,0.08)',
        alignItems: 'center', justifyContent: 'center', marginVertical: 8,
    },
    avatarMiddle: {
        width: 112, height: 112, borderRadius: 56,
        backgroundColor: 'rgba(45,212,191,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarInner: {
        width: 84, height: 84, borderRadius: 42,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 34, fontWeight: '800', color: '#fff' },
    callerName: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    callerUsername: { fontSize: 15, color: Colors.textDim },
    ringingRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
        backgroundColor: 'rgba(45,212,191,0.08)',
        borderWidth: 1, borderColor: 'rgba(45,212,191,0.15)',
        borderRadius: 999, paddingVertical: 8, paddingHorizontal: 18,
    },
    ringingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2DD4BF' },
    ringingText: { fontSize: 13, color: '#2DD4BF', fontWeight: '600' },
    actions: { flexDirection: 'row', justifyContent: 'center', gap: 60, paddingBottom: 20 },
    actionItem: { alignItems: 'center', gap: 12 },
    actionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDim },
    declineBtn: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(248,113,113,0.15)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },
    acceptBtn: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#2DD4BF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#2DD4BF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
});