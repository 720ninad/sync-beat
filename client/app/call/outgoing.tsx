import {
    View, Text, StyleSheet, TouchableOpacity, Animated
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useEffect } from 'react';
import { Colors } from '../../constants/Theme';
import { cancelCall } from '../../src/lib/call';

export default function OutgoingCallScreen() {
    const router = useRouter();
    const { friendName, friendId } = useLocalSearchParams<{
        friendName: string;
        friendId: string;
    }>();

    const pulse1 = useRef(new Animated.Value(1)).current;
    const pulse2 = useRef(new Animated.Value(1)).current;
    const pulse3 = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const animate = (anim: Animated.Value, delay: number) => {
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ).start();
        };
        animate(pulse1, 0);
        animate(pulse2, 300);
        animate(pulse3, 600);
    }, []);

    const handleCancel = () => {
        cancelCall();
        router.replace('/(main)/home');
    };

    const friendInitial = friendName?.charAt(0).toUpperCase() || '?';

    return (
        <View style={s.container}>
            <View style={s.top}>
                <Text style={s.callingLabel}>Calling...</Text>

                {/* Pulse rings */}
                <View style={s.pulseContainer}>
                    <Animated.View style={[s.ring, s.ring3, { transform: [{ scale: pulse3 }], opacity: pulse3.interpolate({ inputRange: [1, 1.6], outputRange: [0.15, 0] }) }]} />
                    <Animated.View style={[s.ring, s.ring2, { transform: [{ scale: pulse2 }], opacity: pulse2.interpolate({ inputRange: [1, 1.6], outputRange: [0.25, 0] }) }]} />
                    <Animated.View style={[s.ring, s.ring1, { transform: [{ scale: pulse1 }], opacity: pulse1.interpolate({ inputRange: [1, 1.6], outputRange: [0.35, 0] }) }]} />
                    <View style={s.avatar}>
                        <Text style={s.avatarText}>{friendInitial}</Text>
                    </View>
                </View>

                <Text style={s.friendName}>{friendName || 'Friend'}</Text>
                <Text style={s.waitingText}>Waiting for them to pick up...</Text>
            </View>

            {/* Cancel */}
            <View style={s.bottom}>
                <View style={s.cancelItem}>
                    <TouchableOpacity
                        style={s.cancelBtn}
                        onPress={handleCancel}
                        activeOpacity={0.85}
                    >
                        <Text style={{ fontSize: 28 }}>📵</Text>
                    </TouchableOpacity>
                    <Text style={s.cancelLabel}>Cancel</Text>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: Colors.bg,
        justifyContent: 'space-between',
        paddingVertical: 60, paddingHorizontal: 24,
    },
    top: { alignItems: 'center', gap: 20, paddingTop: 40 },
    callingLabel: {
        fontSize: 13, fontWeight: '700', letterSpacing: 2,
        textTransform: 'uppercase', color: Colors.textMuted,
    },
    pulseContainer: {
        width: 180, height: 180,
        alignItems: 'center', justifyContent: 'center',
        marginVertical: 16,
    },
    ring: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: Colors.primary,
    },
    ring1: { width: 130, height: 130 },
    ring2: { width: 155, height: 155 },
    ring3: { width: 180, height: 180 },
    avatar: {
        width: 100, height: 100, borderRadius: 32,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5, shadowRadius: 30, elevation: 15,
    },
    avatarText: { fontSize: 40, fontWeight: '800', color: '#fff' },
    friendName: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    waitingText: { fontSize: 14, color: Colors.textDim },
    bottom: { alignItems: 'center', paddingBottom: 20 },
    cancelItem: { alignItems: 'center', gap: 12 },
    cancelBtn: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(248,113,113,0.15)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#F87171',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
    },
    cancelLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDim },
});