import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, RefreshControl, ActivityIndicator,
    TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, CommonStyles } from '../../constants/Theme';
import {
    getMyTracks, getPublicTracks, getLikedTracks,
    likeTrack, unlikeTrack, deleteTrack,
    uploadTrack, formatDuration,
} from '../../src/lib/tracks';
import { toast } from '../../src/lib/toast';

type Tab = 'my' | 'public' | 'liked';

export default function LibraryScreen() {
    const router = useRouter();

    const [tab, setTab] = useState<Tab>('my');
    const [myTracks, setMyTracks] = useState<any[]>([]);
    const [publicTracks, setPublicTracks] = useState<any[]>([]);
    const [likedTrks, setLikedTrks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadPct, setUploadPct] = useState(0);
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Upload modal state
    const [showUpload, setShowUpload] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadArtist, setUploadArtist] = useState('');
    const [uploadFile, setUploadFile] = useState<any>(null);
    const [isPublic, setIsPublic] = useState(false);

    const loadAll = async () => {
        try {
            const [my, pub, liked] = await Promise.all([
                getMyTracks(),
                getPublicTracks(),
                getLikedTracks(),
            ]);
            setMyTracks(my);
            setPublicTracks(pub);
            setLikedTrks(liked);
            setLikedIds(new Set(liked.map((t: any) => t.id)));
        } catch (err) {
            toast.error('Failed to load library');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            loadAll();
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadAll();
    };

    const handlePickFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const file = result.assets[0];
            setUploadFile(file);
            if (!uploadTitle) {
                setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
            }
        } catch (err) {
            console.error('File pick error:', err);
            toast.error('Failed to pick file');
        }
    };

    const handleUpload = async () => {
        if (!uploadFile) { toast.error('Please select a file'); return; }
        if (!uploadTitle.trim()) { toast.error('Please enter a title'); return; }
        try {
            setUploading(true);
            setUploadPct(0);
            await uploadTrack(
                {
                    uri: uploadFile.uri,
                    name: uploadFile.name,
                    mimeType: uploadFile.mimeType || 'audio/mpeg',
                    size: uploadFile.size || 0,
                },
                {
                    title: uploadTitle.trim(),
                    artist: uploadArtist.trim() || 'Unknown',
                    duration: 0,
                    isPublic,
                },
                (pct) => setUploadPct(pct),
            );
            toast.success('Track uploaded! 🎵', 'Done');
            setShowUpload(false);
            setUploadTitle('');
            setUploadArtist('');
            setUploadFile(null);
            setIsPublic(false);
            await loadAll();
        } catch (err: any) {
            console.error('Upload error:', err?.response?.data || err);
            toast.error(err?.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
            setUploadPct(0);
        }
    };

    const handleLike = async (trackId: string) => {
        try {
            if (likedIds.has(trackId)) {
                await unlikeTrack(trackId);
                setLikedIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
                setLikedTrks(prev => prev.filter(t => t.id !== trackId));
            } else {
                await likeTrack(trackId);
                setLikedIds(prev => new Set([...prev, trackId]));
            }
        } catch {
            toast.error('Failed to update like');
        }
    };

    const handleDelete = async () => {
        if (!confirmDeleteId) return;
        try {
            await deleteTrack(confirmDeleteId);
            toast.success('Track deleted');
            setMyTracks(prev => prev.filter(t => t.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        } catch {
            toast.error('Failed to delete track');
            setConfirmDeleteId(null);
        }
    };

    const currentTracks = tab === 'my'
        ? myTracks
        : tab === 'public'
            ? publicTracks
            : likedTrks;

    return (
        <View style={s.container}>

            {/* Header */}
            <View style={s.header}>
                <Text style={s.headerTitle}>Library</Text>
                <TouchableOpacity
                    style={s.uploadBtn}
                    onPress={() => setShowUpload(!showUpload)}
                    activeOpacity={0.85}
                >
                    <Text style={s.uploadBtnText}>+ Upload</Text>
                </TouchableOpacity>
            </View>

            {/* Upload panel */}
            {showUpload && (
                <View style={s.uploadPanel}>
                    <Text style={s.uploadPanelTitle}>Upload a Track</Text>

                    <TouchableOpacity style={s.filePicker} onPress={handlePickFile} activeOpacity={0.85}>
                        <Text style={{ fontSize: 24 }}>🎵</Text>
                        <Text style={s.filePickerText}>
                            {uploadFile ? uploadFile.name : 'Tap to select MP3, WAV, OGG or M4A'}
                        </Text>
                    </TouchableOpacity>

                    <View style={s.field}>
                        <Text style={s.fieldLabel}>TITLE *</Text>
                        <TextInput
                            style={s.fieldInput}
                            placeholder="Track title"
                            placeholderTextColor={Colors.textMuted}
                            value={uploadTitle}
                            onChangeText={setUploadTitle}
                        />
                    </View>

                    <View style={s.field}>
                        <Text style={s.fieldLabel}>ARTIST</Text>
                        <TextInput
                            style={s.fieldInput}
                            placeholder="Artist name (optional)"
                            placeholderTextColor={Colors.textMuted}
                            value={uploadArtist}
                            onChangeText={setUploadArtist}
                        />
                    </View>

                    <TouchableOpacity
                        style={s.publicToggle}
                        onPress={() => setIsPublic(!isPublic)}
                        activeOpacity={0.85}
                    >
                        <View style={[s.toggle, isPublic && s.toggleOn]}>
                            <View style={[s.toggleThumb, isPublic && s.toggleThumbOn]} />
                        </View>
                        <Text style={s.publicToggleText}>
                            {isPublic
                                ? '🌍 Public — anyone can see this'
                                : '🔒 Private — only you can see this'}
                        </Text>
                    </TouchableOpacity>

                    {uploading && (
                        <View style={s.progressWrap}>
                            <View style={s.progressTrack}>
                                <View style={[s.progressFill, { width: `${uploadPct}%` as any }]} />
                            </View>
                            <Text style={s.progressText}>{uploadPct}%</Text>
                        </View>
                    )}

                    <View style={s.uploadActions}>
                        <TouchableOpacity
                            style={s.cancelBtn}
                            onPress={() => setShowUpload(false)}
                            activeOpacity={0.85}
                        >
                            <Text style={s.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.submitBtn, uploading && { opacity: 0.7 }]}
                            onPress={handleUpload}
                            disabled={uploading}
                            activeOpacity={0.85}
                        >
                            {uploading
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={s.submitBtnText}>Upload</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Tabs */}
            <View style={s.tabs}>
                {(['my', 'public', 'liked'] as Tab[]).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[s.tab, tab === t && s.tabActive]}
                        onPress={() => setTab(t)}
                        activeOpacity={0.85}
                    >
                        <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                            {t === 'my' ? `My (${myTracks.length})` :
                                t === 'public' ? `Free (${publicTracks.length})` :
                                    `Liked (${likedTrks.length})`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Track list */}
            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : currentTracks.length === 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>
                        {tab === 'my' ? '🎵' : tab === 'public' ? '🎶' : '❤️'}
                    </Text>
                    <Text style={s.emptyTitle}>
                        {tab === 'my' ? 'No tracks yet' :
                            tab === 'public' ? 'No public tracks yet' :
                                'No liked tracks yet'}
                    </Text>
                    <Text style={s.emptyDesc}>
                        {tab === 'my' ? 'Upload your first track using the button above' :
                            tab === 'public' ? 'Be the first to share a track publicly' :
                                'Like tracks to find them here quickly'}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    style={s.scroll}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={Colors.primary}
                        />
                    }
                >
                    {currentTracks.map((track, i) => (
                        <View
                            key={track.id}
                            style={[s.trackRow, i < currentTracks.length - 1 && s.trackBorder]}
                        >
                            <View style={s.trackIcon}>
                                <Text style={{ fontSize: 22 }}>🎵</Text>
                            </View>

                            <View style={s.trackInfo}>
                                <Text style={s.trackTitle} numberOfLines={1}>{track.title}</Text>
                                <Text style={s.trackMeta}>
                                    {track.artist}
                                    {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                                </Text>
                            </View>

                            <View style={s.trackActions}>
                                <TouchableOpacity
                                    onPress={() => handleLike(track.id)}
                                    style={s.iconBtn}
                                    activeOpacity={0.85}
                                >
                                    <Text style={{ fontSize: 20 }}>
                                        {likedIds.has(track.id) ? '❤️' : '🤍'}
                                    </Text>
                                </TouchableOpacity>

                                {tab === 'my' && (
                                    <TouchableOpacity
                                        onPress={() => setConfirmDeleteId(track.id)}
                                        style={s.deleteBtn}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={s.deleteBtnText}>Delete</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}

            {/* Delete confirmation modal */}
            {confirmDeleteId && (
                <View style={s.modalOverlay}>
                    <View style={s.modalCard}>
                        <Text style={s.modalEmoji}>🗑</Text>
                        <Text style={s.modalTitle}>Delete Track?</Text>
                        <Text style={s.modalDesc}>
                            This will permanently delete this track from your library and Cloudflare R2.
                        </Text>
                        <View style={s.modalActions}>
                            <TouchableOpacity
                                style={s.modalCancelBtn}
                                onPress={() => setConfirmDeleteId(null)}
                                activeOpacity={0.85}
                            >
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={s.modalDeleteBtn}
                                onPress={handleDelete}
                                activeOpacity={0.85}
                            >
                                <Text style={s.modalDeleteText}>Yes, Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Bottom nav */}
            <View style={s.bnav}>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/(main)/home')}>
                    <Text style={s.navIcon}>🏠</Text>
                    <Text style={s.navLabel}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem}>
                    <Text style={s.navIcon}>🎵</Text>
                    <Text style={[s.navLabel, s.navActive]}>Library</Text>
                    <View style={s.navDot} />
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.push('/(main)/profile')}>
                    <Text style={s.navIcon}>👤</Text>
                    <Text style={s.navLabel}>Profile</Text>
                </TouchableOpacity>
            </View>

        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },

    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16,
    },
    headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    uploadBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
    },
    uploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    uploadPanel: {
        marginHorizontal: 24, marginBottom: 16,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 20, padding: 20, gap: 14,
    },
    uploadPanelTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
    filePicker: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.25)',
        borderRadius: 13, padding: 16,
    },
    filePickerText: { flex: 1, fontSize: 13, color: Colors.textDim },
    field: { gap: 6 },
    fieldLabel: {
        fontSize: 10, fontWeight: '700', letterSpacing: 1,
        color: Colors.textMuted, textTransform: 'uppercase',
    },
    fieldInput: {
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 11, padding: 12, paddingHorizontal: 14,
        fontSize: 14, color: Colors.text,
    },
    publicToggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    toggle: {
        width: 44, height: 26, borderRadius: 13,
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        justifyContent: 'center', padding: 2,
    },
    toggleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
    toggleThumbOn: { alignSelf: 'flex-end' },
    publicToggleText: { fontSize: 13, color: Colors.textDim, flex: 1 },
    progressWrap: { gap: 6 },
    progressTrack: {
        height: 6, borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.primary },
    progressText: { fontSize: 12, color: Colors.textDim, textAlign: 'right' },
    uploadActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: {
        flex: 1, backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, padding: 13, alignItems: 'center',
    },
    cancelBtnText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
    submitBtn: {
        flex: 1, backgroundColor: Colors.primary,
        borderRadius: 999, padding: 13, alignItems: 'center',
    },
    submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    tabs: {
        flexDirection: 'row', gap: 8,
        paddingHorizontal: 24, marginBottom: 12,
    },
    tab: {
        flex: 1, paddingVertical: 9,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, alignItems: 'center',
    },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
    tabTextActive: { color: '#fff' },

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
    trackMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    trackActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    iconBtn: { padding: 8 },
    deleteBtn: {
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
        borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
    },
    deleteBtnText: { color: '#F87171', fontSize: 12, fontWeight: '700' },

    emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
    emptyDesc: { fontSize: 13, color: Colors.textDim, textAlign: 'center', paddingHorizontal: 40 },

    // Delete modal
    modalOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 999, paddingHorizontal: 32,
    },
    modalCard: {
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 24, padding: 28,
        alignItems: 'center', gap: 12, width: '100%',
    },
    modalEmoji: { fontSize: 40 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
    modalDesc: { fontSize: 13, color: Colors.textDim, textAlign: 'center', lineHeight: 20 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
    modalCancelBtn: {
        flex: 1, backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, padding: 14, alignItems: 'center',
    },
    modalCancelText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
    modalDeleteBtn: {
        flex: 1,
        backgroundColor: 'rgba(248,113,113,0.15)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
        borderRadius: 999, padding: 14, alignItems: 'center',
    },
    modalDeleteText: { color: '#F87171', fontSize: 14, fontWeight: '700' },

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