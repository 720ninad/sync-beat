import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import { getFriendRequests, acceptFriendRequest, declineFriendRequest } from '../../src/lib/friends';
import { toast } from '../../src/lib/toast';

export default function FriendRequestsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const loadRequests = async () => {
        try {
            const data = await getFriendRequests();
            setRequests(data);
        } catch {
            toast.error('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            loadRequests();
        }, [])
    );

    const handleAccept = async (id: string) => {
        try {
            setLoadingId(id);
            await acceptFriendRequest(id);
            toast.success('You are now friends! 🎉', 'Accepted');
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Failed to accept');
        } finally {
            setLoadingId(null);
        }
    };

    const handleDecline = async (id: string) => {
        try {
            setLoadingId(id);
            await declineFriendRequest(id);
            toast.info('Request declined', 'Declined');
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Failed to decline');
        } finally {
            setLoadingId(null);
        }
    };

    const formatTime = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    return (
        <View style={s.container}>
            {/* Header */}
            <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                    <Text style={s.backBtnText}>←</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>Friend Requests</Text>
                {requests.length > 0 ? (
                    <View style={s.countBadge}>
                        <Text style={s.countBadgeText}>{requests.length}</Text>
                    </View>
                ) : <View style={{ width: 36 }} />}
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : requests.length === 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
                    <Text style={s.emptyTitle}>No pending requests</Text>
                    <Text style={s.emptyDesc}>
                        When someone sends you a friend request it will appear here.
                    </Text>
                    <TouchableOpacity
                        style={s.addBtn}
                        onPress={() => router.push('/add-friend')}
                        activeOpacity={0.85}
                    >
                        <Text style={s.addBtnText}>Add Friends</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    style={s.scroll}
                    contentContainerStyle={s.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.sectionLabel}>
                        {requests.length} PENDING REQUEST{requests.length > 1 ? 'S' : ''}
                    </Text>

                    {requests.map(req => (
                        <View key={req.id} style={s.requestCard}>
                            {/* Avatar */}
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>
                                    {req.sender.name.charAt(0).toUpperCase()}
                                </Text>
                            </View>

                            {/* Info */}
                            <View style={s.info}>
                                <Text style={s.name}>{req.sender.name}</Text>
                                <Text style={s.username}>@{req.sender.username}</Text>
                                <Text style={s.time}>{formatTime(req.createdAt)}</Text>
                            </View>

                            {/* Actions */}
                            <View style={s.actions}>
                                <TouchableOpacity
                                    style={[s.acceptBtn, loadingId === req.id && { opacity: 0.7 }]}
                                    onPress={() => handleAccept(req.id)}
                                    disabled={loadingId === req.id}
                                    activeOpacity={0.85}
                                >
                                    {loadingId === req.id
                                        ? <ActivityIndicator size="small" color="#fff" />
                                        : <Text style={s.acceptBtnText}>Accept</Text>
                                    }
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.declineBtn, loadingId === req.id && { opacity: 0.7 }]}
                                    onPress={() => handleDecline(req.id)}
                                    disabled={loadingId === req.id}
                                    activeOpacity={0.85}
                                >
                                    <Text style={s.declineBtnText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },

    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24, paddingBottom: 16,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    backBtnText: { color: Colors.text, fontSize: 16 },
    headerTitle: { fontSize: 19, fontWeight: '800', color: Colors.text },
    countBadge: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    countBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    center: {
        flex: 1, alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40, gap: 12,
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
    emptyDesc: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },
    addBtn: {
        marginTop: 8,
        backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 14,
        paddingHorizontal: 32,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
    addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 10 },

    sectionLabel: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1,
        color: Colors.textMuted, textTransform: 'uppercase',
        marginBottom: 4,
    },

    requestCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        borderRadius: 18, padding: 16,
    },
    avatar: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 20 },

    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: Colors.text },
    username: { fontSize: 13, color: Colors.textDim, marginTop: 2 },
    time: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },

    actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    acceptBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 10,
        paddingHorizontal: 16, minWidth: 70, alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
    },
    acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    declineBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    declineBtnText: { color: '#F87171', fontSize: 16, fontWeight: '700' },
});