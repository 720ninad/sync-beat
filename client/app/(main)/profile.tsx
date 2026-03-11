import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { Colors, CommonStyles } from '../../constants/Theme';
import { getMe, logoutUser } from '../../src/lib/auth';
import { getStats, getHistory } from '../../src/lib/history';
import { toast } from '../../src/lib/toast';
import { useFocusEffect } from 'expo-router';

const MENU = [
    { icon: '👤', label: 'Edit Profile', bg: 'rgba(123,110,255,0.15)' },
    { icon: '🔒', label: 'Change Password', bg: 'rgba(251,191,36,0.1)' },
];

function StatSkeleton() {
    return (
        <View style={sk.statsRow}>
            {[1, 2, 3].map(i => (
                <View key={i} style={sk.statItem}>
                    <View style={sk.statValue} />
                    <View style={sk.statLabel} />
                </View>
            ))}
        </View>
    );
}

function HistorySkeleton() {
    return (
        <>
            {[1, 2, 3].map(i => (
                <View key={i} style={sk.historyRow}>
                    <View style={sk.historyIcon} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <View style={sk.historyTitle} />
                        <View style={sk.historySub} />
                    </View>
                </View>
            ))}
        </>
    );
}

export default function ProfileScreen() {
    const router = useRouter();

    const [user, setUser] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [histLoading, setHistLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');

    useFocusEffect(useCallback(() => {
        // Load user
        setLoading(true);
        getMe()
            .then((data: any) => setUser(data?.user || data))
            .catch(() => router.replace('/'))
            .finally(() => setLoading(false));

        // Load stats
        setStatsLoading(true);
        getStats()
            .then(setStats)
            .catch(() => { })
            .finally(() => setStatsLoading(false));

        // Load history
        setHistLoading(true);
        getHistory()
            .then(setHistory)
            .catch(() => { })
            .finally(() => setHistLoading(false));
    }, []));

    const handleSignOut = async () => {
        await logoutUser();
        toast.success('See you next time! 👋', 'Signed out');
        setTimeout(() => router.replace('/'), 500);
    };

    const getInitial = () => user?.name?.charAt(0).toUpperCase() || 'A';

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (loading) {
        return (
            <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={Colors.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={s.container}>
            <ScrollView showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <Text style={s.title}>Profile</Text>
                </View>

                {/* Avatar + name */}
                <View style={s.profileSection}>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => router.push('/(main)/edit-profile')}
                    >
                        <View style={s.avatarWrap}>
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>{getInitial()}</Text>
                            </View>
                            <View style={s.editBadge}>
                                <Text style={{ fontSize: 12 }}>✏</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                    <Text style={s.name}>{user?.name || 'Your Name'}</Text>
                    <Text style={s.username}>@{user?.username || 'username'}</Text>
                    {user?.bio ? <Text style={s.bio}>{user.bio}</Text> : null}

                    {/* Stats row */}
                    {statsLoading ? <StatSkeleton /> : (
                        <View style={s.statsRow}>
                            <View style={s.statItem}>
                                <Text style={s.statValue}>{stats?.totalCalls || 0}</Text>
                                <Text style={s.statLabel}>Calls</Text>
                            </View>
                            <View style={s.statDivider} />
                            <View style={s.statItem}>
                                <Text style={s.statValue}>{stats?.totalListenLabel || '0m'}</Text>
                                <Text style={s.statLabel}>Listened</Text>
                            </View>
                            <View style={s.statDivider} />
                            <View style={s.statItem}>
                                <Text style={s.statValue}>{stats?.uniqueFriends || 0}</Text>
                                <Text style={s.statLabel}>Friends</Text>
                            </View>
                        </View>
                    )}

                    {/* Favorite track */}
                    {stats?.favoriteTrack && (
                        <View style={s.favTrack}>
                            <Text style={s.favIcon}>🎵</Text>
                            <View>
                                <Text style={s.favTitle} numberOfLines={1}>
                                    {stats.favoriteTrack.trackTitle}
                                </Text>
                                <Text style={s.favSub}>Most played track</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Tabs */}
                <View style={s.tabs}>
                    {(['stats', 'history'] as const).map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[s.tab, activeTab === t && s.tabActive]}
                            onPress={() => setActiveTab(t)}
                            activeOpacity={0.85}
                        >
                            <Text style={[s.tabText, activeTab === t && s.tabTextActive]}>
                                {t === 'stats' ? '📊 Stats' : '🕘 History'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Tab content */}
                <View style={s.tabContent}>

                    {activeTab === 'stats' && (
                        <View style={s.menu}>
                            {MENU.map(item => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={s.menuItem}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        if (item.label === 'Edit Profile') router.push('/(main)/edit-profile');
                                        if (item.label === 'Change Password') router.push('/(main)/change-password');
                                    }}
                                >
                                    <View style={[s.menuIcon, { backgroundColor: item.bg }]}>
                                        <Text style={{ fontSize: 17 }}>{item.icon}</Text>
                                    </View>
                                    <Text style={s.menuLabel}>{item.label}</Text>
                                    <Text style={s.menuChevron}>›</Text>
                                </TouchableOpacity>
                            ))}

                            <TouchableOpacity
                                style={s.signOutItem}
                                activeOpacity={0.85}
                                onPress={handleSignOut}
                            >
                                <View style={s.signOutIcon}>
                                    <Text style={{ fontSize: 17 }}>🚪</Text>
                                </View>
                                <Text style={s.signOutText}>Sign Out</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {activeTab === 'history' && (
                        <View style={s.historySection}>
                            {histLoading ? <HistorySkeleton /> : history.length === 0 ? (
                                <View style={s.emptyState}>
                                    <Text style={s.emptyIcon}>🎵</Text>
                                    <Text style={s.emptyTitle}>No listen history yet</Text>
                                    <Text style={s.emptySub}>Start a call and play some music!</Text>
                                    <TouchableOpacity
                                        style={s.emptyBtn}
                                        onPress={() => router.replace('/(main)/home')}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={s.emptyBtnText}>Find Friends</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                history.map((item, i) => (
                                    <View
                                        key={item.id}
                                        style={[s.historyRow, i < history.length - 1 && s.historyBorder]}
                                    >
                                        <View style={s.historyIconWrap}>
                                            <Text style={{ fontSize: 20 }}>🎵</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.historyTrack} numberOfLines={1}>
                                                {item.trackTitle || 'Unknown Track'}
                                            </Text>
                                            <Text style={s.historySub}>
                                                with {item.friendName || 'Unknown'}
                                                {item.durationSecs
                                                    ? ` · ${Math.floor(item.durationSecs / 60)}m`
                                                    : ''}
                                            </Text>
                                        </View>
                                        <Text style={s.historyDate}>
                                            {formatDate(item.createdAt)}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </View>
                    )}

                </View>

            </ScrollView>

            {/* Bottom nav */}
            <View style={s.bnav}>
                <TouchableOpacity style={s.navItem} onPress={() => router.replace('/(main)/home')}>
                    <Text style={s.navIcon}>🏠</Text>
                    <Text style={s.navLabel}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.replace('/(main)/library')}>
                    <Text style={s.navIcon}>🎵</Text>
                    <Text style={s.navLabel}>Library</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem}>
                    <Text style={s.navIcon}>👤</Text>
                    <Text style={[s.navLabel, s.navActive]}>Profile</Text>
                    <View style={s.navDot} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,

    header: { padding: 24, paddingTop: 28 },
    title: { fontSize: 22, fontWeight: '800', color: Colors.text },

    profileSection: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, gap: 8 },
    avatarWrap: { position: 'relative' },
    avatar: {
        width: 80, height: 80, borderRadius: 26,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 12,
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 30 },
    editBadge: {
        position: 'absolute', bottom: -5, right: -5,
        width: 26, height: 26, borderRadius: 9,
        backgroundColor: Colors.primary,
        borderWidth: 3, borderColor: '#0D0D1C',
        alignItems: 'center', justifyContent: 'center',
    },
    name: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginTop: 4 },
    username: { fontSize: 14, color: Colors.textDim },
    bio: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },

    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 },
    statItem: { alignItems: 'center', gap: 4 },
    statValue: { fontSize: 20, fontWeight: '800', color: '#9B90FF' },
    statLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
    statDivider: { width: 1, height: 32, backgroundColor: Colors.border },

    favTrack: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(123,110,255,0.08)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.18)',
        borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16,
        marginTop: 4, alignSelf: 'stretch', marginHorizontal: 8,
    },
    favIcon: { fontSize: 22 },
    favTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
    favSub: { fontSize: 11, color: Colors.textDim },

    tabs: {
        flexDirection: 'row', gap: 8,
        paddingHorizontal: 24, marginBottom: 16,
    },
    tab: {
        flex: 1, paddingVertical: 9,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, alignItems: 'center',
    },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
    tabTextActive: { color: '#fff' },

    tabContent: { paddingBottom: 100 },

    menu: { paddingHorizontal: 24, gap: 9 },
    menuItem: {
        flexDirection: 'row', alignItems: 'center', gap: 13,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, padding: 14,
    },
    menuIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },
    menuChevron: { color: Colors.textMuted, fontSize: 18 },
    signOutItem: {
        flexDirection: 'row', alignItems: 'center', gap: 13,
        backgroundColor: 'rgba(248,113,113,0.05)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.14)',
        borderRadius: 16, padding: 14, marginTop: 6,
    },
    signOutIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(248,113,113,0.08)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    signOutText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#F87171' },

    historySection: { paddingHorizontal: 24, gap: 0 },
    historyRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14,
    },
    historyBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
    historyIconWrap: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: 'rgba(123,110,255,0.1)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    historyTrack: { fontSize: 14, fontWeight: '600', color: Colors.text },
    historySub: { fontSize: 12, color: Colors.textDim, marginTop: 2 },
    historyDate: { fontSize: 11, color: Colors.textMuted },

    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
    emptySub: { fontSize: 13, color: Colors.textDim, textAlign: 'center' },
    emptyBtn: {
        marginTop: 8, backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 12, paddingHorizontal: 28,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    bnav: CommonStyles.bnav,
    navItem: { alignItems: 'center', gap: 4, position: 'relative' },
    navIcon: { fontSize: 22 },
    navLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
    navActive: { color: '#9B90FF' },
    navDot: { position: 'absolute', bottom: -7, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary },
});

// ─── SKELETON STYLES ─────────────────────────────────
const sk = StyleSheet.create({
    statsRow: { flexDirection: 'row', gap: 28, marginTop: 12 },
    statItem: { alignItems: 'center', gap: 6 },
    statValue: { width: 40, height: 22, borderRadius: 6, backgroundColor: Colors.card },
    statLabel: { width: 50, height: 10, borderRadius: 4, backgroundColor: Colors.card },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 24 },
    historyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.card },
    historyTitle: { width: 160, height: 14, borderRadius: 4, backgroundColor: Colors.card },
    historySub: { width: 100, height: 11, borderRadius: 4, backgroundColor: Colors.card },
});