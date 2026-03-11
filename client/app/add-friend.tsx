import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../constants/Theme';
import {
    searchUsers, sendFriendRequest,
    getFriendRequests, acceptFriendRequest, declineFriendRequest
} from '../src/lib/friends';
import { toast } from '../src/lib/toast';
import { getMe } from '../src/lib/auth';

export default function AddFriendScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [me, setMe] = useState<any>(null);
    const [searching, setSearching] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    useEffect(() => {
        getMe().then(setMe);
        loadRequests();
    }, []);

    useEffect(() => {
        if (query.length < 2) { setResults([]); return; }
        const timeout = setTimeout(async () => {
            try {
                setSearching(true);
                const data = await searchUsers(query);
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 400); // debounce
        return () => clearTimeout(timeout);
    }, [query]);

    const loadRequests = async () => {
        try {
            const data = await getFriendRequests();
            setRequests(data);
        } catch { }
    };

    const handleSendRequest = async (username: string, resultIndex: number) => {
        try {
            setLoadingId(username);
            await sendFriendRequest(username);
            toast.success('Friend request sent! 🎉', 'Request sent');
            // Update UI
            setResults(prev => prev.map((r, i) =>
                i === resultIndex ? { ...r, friendshipStatus: 'pending', isSender: true } : r
            ));
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Failed to send request');
        } finally {
            setLoadingId(null);
        }
    };

    const handleAccept = async (id: string) => {
        try {
            setLoadingId(id);
            await acceptFriendRequest(id);
            toast.success('You are now friends! 🎉', 'Accepted');
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Failed to accept request');
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
            toast.error(err?.response?.data?.error || 'Failed to decline request');
        } finally {
            setLoadingId(null);
        }
    };

    const handleCopy = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getStatusLabel = (result: any) => {
        if (!result.friendshipStatus) return 'none';
        if (result.friendshipStatus === 'accepted') return 'friends';
        if (result.friendshipStatus === 'pending' && result.isSender) return 'sent';
        if (result.friendshipStatus === 'pending' && !result.isSender) return 'incoming';
        return 'none';
    };

    return (
        <View style={s.container}>
            <ScrollView
                style={s.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
                    <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                        <Text style={s.backBtnText}>←</Text>
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>Add Friend</Text>
                    {requests.length > 0 ? (
                        <View style={s.badge}>
                            <Text style={s.badgeText}>{requests.length}</Text>
                        </View>
                    ) : <View style={{ width: 36 }} />}
                </View>

                <View style={s.content}>

                    {/* Search box */}
                    <View style={[s.searchBox, query.length > 0 && s.searchBoxActive]}>
                        <Text style={s.searchIcon}>🔍</Text>
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search by username..."
                            placeholderTextColor={Colors.textMuted}
                            value={query}
                            onChangeText={setQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {searching && <ActivityIndicator size="small" color={Colors.primary} />}
                        {query.length > 0 && !searching && (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <Text style={{ color: Colors.textMuted, fontSize: 18 }}>×</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Search results */}
                    {results.length > 0 && (
                        <View style={s.resultsSection}>
                            {results.map((result, i) => {
                                const status = getStatusLabel(result);
                                return (
                                    <View key={result.id} style={s.resultCard}>
                                        <View style={s.resultAvatar}>
                                            <Text style={s.resultAvatarText}>
                                                {result.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={s.resultInfo}>
                                            <Text style={s.resultName}>{result.name}</Text>
                                            <Text style={s.resultUsername}>@{result.username}</Text>
                                            {result.bio ? <Text style={s.resultBio}>{result.bio}</Text> : null}
                                        </View>
                                        {status === 'none' && (
                                            <TouchableOpacity
                                                style={[s.addBtn, loadingId === result.username && { opacity: 0.7 }]}
                                                onPress={() => handleSendRequest(result.username, i)}
                                                disabled={loadingId === result.username}
                                                activeOpacity={0.85}
                                            >
                                                {loadingId === result.username
                                                    ? <ActivityIndicator size="small" color="#fff" />
                                                    : <Text style={s.addBtnText}>Add +</Text>
                                                }
                                            </TouchableOpacity>
                                        )}
                                        {status === 'sent' && (
                                            <View style={s.sentBadge}>
                                                <Text style={s.sentBadgeText}>Sent ✓</Text>
                                            </View>
                                        )}
                                        {status === 'friends' && (
                                            <View style={s.friendsBadge}>
                                                <Text style={s.friendsBadgeText}>Friends 🎵</Text>
                                            </View>
                                        )}
                                        {status === 'incoming' && (
                                            <TouchableOpacity
                                                style={s.acceptBtn}
                                                onPress={() => handleAccept(result.friendshipId)}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={s.acceptBtnText}>Accept</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {query.length >= 2 && !searching && results.length === 0 && (
                        <View style={s.noResults}>
                            <Text style={{ fontSize: 32 }}>🔍</Text>
                            <Text style={s.noResultsText}>No users found for "{query}"</Text>
                        </View>
                    )}

                    {/* Pending requests */}
                    {requests.length > 0 && (
                        <View style={s.requestsSection}>
                            <Text style={s.sectionLabel}>FRIEND REQUESTS ({requests.length})</Text>
                            {requests.map(req => (
                                <View key={req.id} style={s.requestCard}>
                                    <View style={s.resultAvatar}>
                                        <Text style={s.resultAvatarText}>
                                            {req.sender.name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={s.resultInfo}>
                                        <Text style={s.resultName}>{req.sender.name}</Text>
                                        <Text style={s.resultUsername}>@{req.sender.username}</Text>
                                    </View>
                                    <View style={s.requestActions}>
                                        <TouchableOpacity
                                            style={[s.acceptBtn, loadingId === req.id && { opacity: 0.7 }]}
                                            onPress={() => handleAccept(req.id)}
                                            disabled={loadingId === req.id}
                                            activeOpacity={0.85}
                                        >
                                            <Text style={s.acceptBtnText}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={s.declineBtn}
                                            onPress={() => handleDecline(req.id)}
                                            disabled={loadingId === req.id}
                                            activeOpacity={0.85}
                                        >
                                            <Text style={s.declineBtnText}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Divider */}
                    <View style={s.divider}>
                        <View style={s.dividerLine} />
                        <Text style={s.dividerText}>or</Text>
                        <View style={s.dividerLine} />
                    </View>

                    {/* Share username */}
                    <View style={s.shareCard}>
                        <Text style={s.shareTitle}>Share your username</Text>
                        <Text style={s.shareDesc}>
                            Let friends find you — send them your username and they can add you directly.
                        </Text>
                        <TouchableOpacity style={s.usernameRow} onPress={handleCopy} activeOpacity={0.85}>
                            <Text style={s.usernameValue}>@{me?.username || '...'}</Text>
                            <Text style={s.copyBtn}>{copied ? '✓ Copied!' : 'Copy'}</Text>
                        </TouchableOpacity>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },

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
    badge: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    content: { paddingHorizontal: 24, gap: 20 },

    searchBox: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: Colors.input,
        borderWidth: 1.5, borderColor: Colors.border,
        borderRadius: 13, padding: 14, paddingHorizontal: 18,
    },
    searchBoxActive: { borderColor: 'rgba(123,110,255,0.35)' },
    searchIcon: { fontSize: 16, color: Colors.textMuted },
    searchInput: { flex: 1, fontSize: 15, color: Colors.text },

    resultsSection: { gap: 10 },
    resultCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, padding: 14,
    },
    requestCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        borderRadius: 16, padding: 14,
    },
    resultAvatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    resultAvatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
    resultInfo: { flex: 1 },
    resultName: { fontSize: 15, fontWeight: '700', color: Colors.text },
    resultUsername: { fontSize: 13, color: Colors.textDim, marginTop: 2 },
    resultBio: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    addBtn: {
        backgroundColor: Colors.primary, borderRadius: 999,
        paddingVertical: 10, paddingHorizontal: 18,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45, shadowRadius: 10, elevation: 6,
        minWidth: 70, alignItems: 'center',
    },
    addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    sentBadge: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.border },
    sentBadgeText: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
    friendsBadge: { backgroundColor: 'rgba(45,212,191,0.1)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(45,212,191,0.2)' },
    friendsBadgeText: { color: '#2DD4BF', fontSize: 12, fontWeight: '600' },

    acceptBtn: { backgroundColor: Colors.primary, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
    acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    requestsSection: { gap: 10 },
    sectionLabel: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1,
        color: Colors.textMuted, textTransform: 'uppercase',
    },
    requestActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    declineBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.1)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.22)', alignItems: 'center', justifyContent: 'center' },
    declineBtnText: { color: '#F87171', fontSize: 16, fontWeight: '700' },

    noResults: { alignItems: 'center', gap: 10, paddingVertical: 20 },
    noResultsText: { fontSize: 14, color: Colors.textDim },

    divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
    dividerText: { fontSize: 12, color: Colors.textMuted },

    shareCard: {
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 20, padding: 20, gap: 8,
    },
    shareTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
    shareDesc: { fontSize: 13, color: Colors.textDim, lineHeight: 20 },
    usernameRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 13, padding: 13, paddingHorizontal: 16, marginTop: 8,
    },
    usernameValue: { fontFamily: 'monospace', fontSize: 17, fontWeight: '800', color: '#2DD4BF', letterSpacing: 1 },
    copyBtn: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});