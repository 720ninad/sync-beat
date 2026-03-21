import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Animated, RefreshControl, ActivityIndicator
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Colors, CommonStyles } from '../../constants/Theme';
import { getFriends, getFriendRequests } from '../../src/lib/friends';
import { getMe } from '../../src/lib/auth';
import { getSocket } from '../../src/lib/socket';
import { initiateCall } from '../../src/lib/call';

function PulseDot() {
    const anim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    return <Animated.View style={[s.pulseDot, { opacity: anim }]} />;
}

function formatLastSeen(dateStr: string): string {
    if (!dateStr) return 'a while ago';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

export default function HomeScreen() {
    const router = useRouter();

    const [friends, setFriends] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [requestCount, setRequestCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        try {
            const [friendsData, userData, requestsData] = await Promise.all([
                getFriends(),
                getMe(),
                getFriendRequests(),
            ]);
            setFriends(friendsData);
            setUser(userData);
            setRequestCount(requestsData.length);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Bind socket presence listeners — re-run on every focus so they're
    // always fresh after returning from a call screen
    useFocusEffect(
        useCallback(() => {
            const socket = getSocket();
            if (!socket) return;

            // Remove stale listeners before re-adding (prevents duplicates)
            socket.off('friend:online');
            socket.off('friend:offline');

            socket.on('friend:online', ({ userId }: { userId: string }) => {
                setFriends(prev => prev.map(f =>
                    f.id === userId ? { ...f, isOnline: true } : f
                ));
            });

            socket.on('friend:offline', ({ userId, lastSeenAt }: { userId: string; lastSeenAt: string }) => {
                setFriends(prev => prev.map(f =>
                    f.id === userId ? { ...f, isOnline: false, lastSeenAt } : f
                ));
            });

            // Reload friend list (picks up fresh Redis presence state)
            setLoading(true);
            loadData();

            return () => {
                socket.off('friend:online');
                socket.off('friend:offline');
            };
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning ☀️';
        if (hour < 18) return 'Good afternoon 👋';
        return 'Good evening 🌙';
    };

    const getInitial = () => user?.name?.charAt(0).toUpperCase() || 'A';

    const onlineFriends = friends.filter(f => f.isOnline);
    const offlineFriends = friends.filter(f => !f.isOnline);

    // ─── Header (shared) ──────────────────────────────
    const Header = () => (
        <View style={s.header}>
            <View>
                <Text style={s.greeting}>{getGreeting()}</Text>
                <Text style={s.name}>Hey, {user?.name?.split(' ')[0] || 'there'}</Text>
            </View>
            <View style={s.headerRight}>
                <TouchableOpacity
                    style={s.bellBtn}
                    onPress={() => router.push('/(main)/friend-requests')}
                    activeOpacity={0.8}
                >
                    <Text style={{ fontSize: 20 }}>🔔</Text>
                    {requestCount > 0 && (
                        <View style={s.bellBadge}>
                            <Text style={s.bellBadgeText}>
                                {requestCount > 9 ? '9+' : requestCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={s.avatar}
                    onPress={() => router.push('/(main)/profile')}
                    activeOpacity={0.8}
                >
                    <Text style={s.avatarText}>{getInitial()}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // ─── Bottom Nav (shared) ──────────────────────────
    const BottomNav = () => (
        <View style={s.bnav}>
            <TouchableOpacity style={s.navItem}>
                <Text style={s.navIcon}>🏠</Text>
                <Text style={[s.navLabel, s.navActive]}>Home</Text>
                <View style={s.navDot} />
            </TouchableOpacity>
            <TouchableOpacity style={s.navItem} onPress={() => router.push('/(main)/library')}>
                <Text style={s.navIcon}>🎵</Text>
                <Text style={s.navLabel}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.navItem} onPress={() => router.push('/(main)/profile')}>
                <Text style={s.navIcon}>👤</Text>
                <Text style={s.navLabel}>Profile</Text>
            </TouchableOpacity>
        </View>
    );

    // ─── Loading ──────────────────────────────────────
    if (loading) {
        return (
            <View style={[s.container, s.center]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    // ─── Empty state ──────────────────────────────────
    if (friends.length === 0) {
        return (
            <View style={s.container}>
                <Header />
                <View style={s.emptyCenter}>
                    <View style={s.emptyIconBox}>
                        <Text style={{ fontSize: 38 }}>👥</Text>
                    </View>
                    <View style={s.emptyTextBlock}>
                        <Text style={s.emptyTitle}>No friends yet</Text>
                        <Text style={s.emptyDesc}>
                            Add a friend to start calling and listening to music together in sync.
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={s.btnPrimary}
                        activeOpacity={0.85}
                        onPress={() => router.push('/add-friend')}
                    >
                        <Text style={s.btnPrimaryText}>Add Your First Friend</Text>
                    </TouchableOpacity>
                    <Text style={s.usernameHint}>
                        Your username:{' '}
                        <Text style={s.usernameValue}>@{user?.username}</Text>
                    </Text>
                </View>
                <BottomNav />
            </View>
        );
    }

    // ─── Friends list ─────────────────────────────────
    return (
        <View style={s.container}>
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                    />
                }
            >
                <Header />

                <View style={s.section}>
                    {/* Section header */}
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>
                            Your Friends
                            <Text style={s.friendCount}> ({friends.length})</Text>
                        </Text>
                        <TouchableOpacity onPress={() => router.push('/add-friend')}>
                            <Text style={s.addFriendLink}>+ Add</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Online friends */}
                    {onlineFriends.length > 0 && (
                        <>
                            <Text style={s.subLabel}>ONLINE NOW ({onlineFriends.length})</Text>
                            {onlineFriends.map(friend => (
                                <View key={friend.id} style={s.friendCardOnline}>
                                    <View style={s.avatarWrap}>
                                        <View style={[s.friendAvatar, { backgroundColor: Colors.primary }]}>
                                            <Text style={s.friendAvatarText}>
                                                {friend.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={s.onlineDot} />
                                    </View>
                                    <View style={s.friendInfo}>
                                        <Text style={s.friendName}>{friend.name}</Text>
                                        <View style={s.onlineRow}>
                                            <PulseDot />
                                            <Text style={s.onlineText}>Online now</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={s.callBtn}
                                        // Replace the call button onPress:
                                        onPress={() => {
                                            initiateCall(friend.id);
                                            router.push({
                                                pathname: '/call/outgoing',
                                                params: {
                                                    friendId: friend.id,
                                                    friendName: friend.name,
                                                },
                                            });
                                        }}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={{ fontSize: 20 }}>📞</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </>
                    )}

                    {/* Offline friends */}
                    {offlineFriends.length > 0 && (
                        <>
                            <Text style={[s.subLabel, { marginTop: onlineFriends.length > 0 ? 8 : 0 }]}>
                                OFFLINE ({offlineFriends.length})
                            </Text>
                            {offlineFriends.map(friend => (
                                <View key={friend.id} style={s.friendCardOffline}>
                                    <View style={s.friendAvatar}>
                                        <Text style={s.friendAvatarText}>
                                            {friend.name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={s.friendInfo}>
                                        <Text style={[s.friendName, { opacity: 0.6 }]}>{friend.name}</Text>
                                        <Text style={s.offlineText}>
                                            Last seen {formatLastSeen(friend.lastSeenAt)}
                                        </Text>
                                    </View>
                                    <View style={s.callBtnDisabled}>
                                        <Text style={{ fontSize: 20, opacity: 0.3 }}>📞</Text>
                                    </View>
                                </View>
                            ))}
                        </>
                    )}
                </View>
            </ScrollView>

            <BottomNav />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // Header
    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingHorizontal: 24,
        paddingTop: 28, paddingBottom: 20,
    },
    greeting: { fontSize: 13, color: Colors.textDim },
    name: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bellBtn: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
    },
    bellBadge: {
        position: 'absolute', top: -4, right: -4,
        backgroundColor: '#F87171',
        minWidth: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: Colors.bg,
        paddingHorizontal: 3,
    },
    bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    avatar: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    // Section
    section: { paddingHorizontal: 24, gap: 10 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
    friendCount: { fontSize: 14, fontWeight: '500', color: Colors.textDim },
    addFriendLink: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
    subLabel: {
        fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
        color: Colors.textMuted, textTransform: 'uppercase',
        marginBottom: 2,
    },

    // Friend cards
    friendCardOnline: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: 'rgba(45,212,191,0.15)',
        borderRadius: 16, padding: 14,
    },
    friendCardOffline: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, padding: 14,
    },
    avatarWrap: { position: 'relative' },
    friendAvatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: Colors.textMuted,
        alignItems: 'center', justifyContent: 'center',
    },
    friendAvatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
    onlineDot: {
        position: 'absolute', bottom: 1, right: 1,
        width: 13, height: 13, borderRadius: 7,
        backgroundColor: '#2DD4BF',
        borderWidth: 3, borderColor: Colors.card,
    },
    friendInfo: { flex: 1 },
    friendName: { fontSize: 15, fontWeight: '700', color: Colors.text },
    onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2DD4BF' },
    onlineText: { fontSize: 12, color: '#2DD4BF' },
    offlineText: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    callBtn: {
        width: 44, height: 44, borderRadius: 13,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    },
    callBtnDisabled: {
        width: 44, height: 44, borderRadius: 13,
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },

    // Empty state
    emptyCenter: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 40, paddingBottom: 60, gap: 20,
    },
    emptyIconBox: {
        width: 88, height: 88, borderRadius: 28,
        backgroundColor: 'rgba(123,110,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    emptyTextBlock: { alignItems: 'center', gap: 10 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    emptyDesc: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },
    btnPrimary: {
        width: '100%', backgroundColor: Colors.primary,
        borderRadius: 999, padding: 16, alignItems: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
    btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    usernameHint: { fontSize: 12, color: Colors.textMuted },
    usernameValue: { color: '#2DD4BF', fontWeight: '700', fontSize: 14 },

    // Bottom nav
    bnav: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-around',
        paddingVertical: 14, paddingBottom: 28,
        backgroundColor: 'rgba(7,7,16,0.96)',
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    navItem: { alignItems: 'center', gap: 4, position: 'relative' },
    navIcon: { fontSize: 22 },
    navLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
    navActive: { color: '#9B90FF' },
    navDot: {
        position: 'absolute', bottom: -7,
        width: 5, height: 5, borderRadius: 3,
        backgroundColor: Colors.primary,
    },
});