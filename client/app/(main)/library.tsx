import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, RefreshControl, ActivityIndicator,
    TextInput, PanResponder, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, CommonStyles } from '../../constants/Theme';
import {
    getMyTracks, getPublicTracks, getLikedTracks,
    likeTrack, unlikeTrack, deleteTrack,
    uploadTrack, formatDuration,
} from '../../src/lib/tracks';
import { searchExternalTracks, addExternalTrack, ExternalTrack } from '../../src/lib/musicSearch';
import { audioPlayer } from '../../src/lib/audioPlayer';
import { toast } from '../../src/lib/toast';

type Tab = 'my' | 'public' | 'liked' | 'search';

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

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ExternalTrack[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingTrack, setAddingTrack] = useState<string | null>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Audio playback state
    const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [justSeeked, setJustSeeked] = useState(false);
    const [timelinePressed, setTimelinePressed] = useState(false);

    // Track which external tracks are already added
    const [addedExternalIds, setAddedExternalIds] = useState<Set<string>>(new Set());

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

            // Track which external tracks are already added
            const externalIds = new Set<string>();
            my.forEach((track: any) => {
                if (track.externalId && track.externalSource) {
                    externalIds.add(`${track.externalSource.toLowerCase()}:${track.externalId}`);
                }
            });
            setAddedExternalIds(externalIds);
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

    // Search functions
    const performSearch = async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        try {
            setSearching(true);
            const results = await searchExternalTracks(query.trim());
            setSearchResults(results);
        } catch (error) {
            toast.error('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const handleSearchQueryChange = (text: string) => {
        setSearchQuery(text);

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Only search if query has at least 3 characters
        if (text.trim().length < 3) {
            setSearchResults([]);
            return;
        }

        // Set new timeout for debounced search
        searchTimeoutRef.current = setTimeout(() => {
            performSearch(text);
        }, 500); // 500ms debounce delay
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            audioPlayer.stop();
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    // Track playback position
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (currentlyPlaying && isPlaying && !isDragging && !justSeeked) {
            interval = setInterval(async () => {
                const status = await audioPlayer.getStatus();
                if (status?.isLoaded) {
                    const position = status.positionMillis || 0;
                    const duration = status.durationMillis || 0;

                    // Only update if values are finite
                    if (isFinite(position) && position >= 0) {
                        setPlaybackPosition(position);
                    }
                    if (isFinite(duration) && duration > 0) {
                        setPlaybackDuration(duration);
                    }
                }
            }, 100);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [currentlyPlaying, isPlaying, isDragging, justSeeked]);

    // Helper function to format time
    const formatTime = (ms: number) => {
        // Handle invalid inputs
        if (!isFinite(ms) || ms < 0) {
            return '0:00';
        }

        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Timeline container ref for accurate width measurement
    const timelineRef = useRef<View>(null);
    const [timelineWidth, setTimelineWidth] = useState(0);

    // Handle timeline seek
    const handleTimelineSeek = async (position: number) => {
        // Validate inputs
        if (!isFinite(position) || !isFinite(playbackDuration) || playbackDuration <= 0) {
            return;
        }

        const seekPosition = Math.max(0, Math.min(playbackDuration, position * playbackDuration));

        // Ensure seekPosition is finite before seeking
        if (isFinite(seekPosition)) {
            setJustSeeked(true);
            await audioPlayer.seek(seekPosition);
            setPlaybackPosition(seekPosition);

            // Clear the justSeeked flag after a short delay
            setTimeout(() => {
                setJustSeeked(false);
            }, 200);
        }
    };

    // Timeline PanResponder for both click and drag functionality
    const timelinePanResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
            // Start drag immediately for any movement
            return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
        },
        onPanResponderGrant: (evt) => {
            setIsDragging(true);
            setTimelinePressed(true);
            // Handle initial tap/click
            const { locationX } = evt.nativeEvent;
            if (isFinite(locationX) && timelineWidth > 0) {
                const position = Math.max(0, Math.min(1, locationX / timelineWidth));
                if (isFinite(position)) {
                    const newPosition = position * playbackDuration;
                    if (isFinite(newPosition)) {
                        setPlaybackPosition(newPosition);
                    }
                }
            }
        },
        onPanResponderMove: (evt) => {
            const { locationX } = evt.nativeEvent;

            // Validate locationX and timelineWidth
            if (!isFinite(locationX) || timelineWidth <= 0) return;

            const position = Math.max(0, Math.min(1, locationX / timelineWidth));

            // Validate position and duration
            if (isFinite(position) && isFinite(playbackDuration) && playbackDuration > 0) {
                const newPosition = position * playbackDuration;
                if (isFinite(newPosition)) {
                    setPlaybackPosition(newPosition);
                }
            }
        },
        onPanResponderRelease: (evt) => {
            const { locationX } = evt.nativeEvent;

            // Validate locationX and timelineWidth
            if (!isFinite(locationX) || timelineWidth <= 0) {
                setIsDragging(false);
                setTimelinePressed(false);
                return;
            }

            const position = Math.max(0, Math.min(1, locationX / timelineWidth));

            // Validate position before seeking
            if (isFinite(position)) {
                handleTimelineSeek(position);
            }

            setIsDragging(false);
            setTimelinePressed(false);
        },
    });

    const handleSearch = async () => {
        // Clear timeout and search immediately when search button is pressed
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        await performSearch(searchQuery);
    };

    const handleAddExternalTrack = async (track: ExternalTrack) => {
        try {
            setAddingTrack(track.id);
            await addExternalTrack(track);
            toast.success(`Added "${track.name}" to your library! 🎵`);

            // Add to the set of added external IDs
            const externalKey = `${track.source.toLowerCase()}:${track.external_id}`;
            setAddedExternalIds(prev => new Set([...prev, externalKey]));

            // Refresh my tracks to show the new addition
            const updatedTracks = await getMyTracks();
            setMyTracks(updatedTracks);
        } catch (error) {
            toast.error('Failed to add track');
        } finally {
            setAddingTrack(null);
        }
    };

    // Helper function to check if an external track is already added
    const isTrackAlreadyAdded = (track: ExternalTrack): boolean => {
        if (!track.external_id || !track.source) return false;
        const externalKey = `${track.source.toLowerCase()}:${track.external_id}`;
        return addedExternalIds.has(externalKey);
    };

    // Audio playback functions
    const handlePlayTrack = async (track: any) => {
        try {
            // If this track is already playing, pause it
            if (currentlyPlaying === track.id && isPlaying) {
                await audioPlayer.pause();
                setIsPlaying(false);
                return;
            }

            // If this track is paused, resume it
            if (currentlyPlaying === track.id && !isPlaying) {
                await audioPlayer.resume();
                setIsPlaying(true);
                return;
            }

            // Play new track
            const success = await audioPlayer.playTrack(track);

            if (success) {
                setCurrentlyPlaying(track.id);
                setIsPlaying(true);
                setPlaybackPosition(0); // Reset position for new track
                setPlaybackDuration(0); // Reset duration for new track

                // Different messages for different track types
                if ((track.preview_url || track.previewUrl) && (tab === 'search' || track.mimeType === 'external')) {
                    toast.success(`Playing "${track.name || track.title}" - Full Song 🎵`);
                } else if (track.fileUrl && track.mimeType !== 'external') {
                    toast.success(`Playing "${track.title || track.name}"`);
                } else {
                    toast.success(`Playing "${track.name || track.title}"`);
                }
            } else {
                // No playable audio available
                if (tab === 'search') {
                    toast.info(`"${track.name || track.title}" - No audio available for this track`);
                } else if (track.mimeType === 'external') {
                    toast.info(`"${track.title || track.name}" - No audio available for this track`);
                } else {
                    toast.error('Unable to play this track');
                }
                setIsPlaying(false);
                setCurrentlyPlaying(null);
            }

        } catch (error) {
            toast.error('Failed to play track');
            setIsPlaying(false);
            setCurrentlyPlaying(null);
        }
    };

    const currentTracks = tab === 'my'
        ? myTracks
        : tab === 'public'
            ? publicTracks
            : tab === 'liked'
                ? likedTrks
                : searchResults;

    return (
        <View style={s.container}>

            {/* Header */}
            <View style={s.header}>
                <Text style={s.headerTitle}>Library</Text>
                {tab !== 'search' && (
                    <TouchableOpacity
                        style={s.uploadBtn}
                        onPress={() => setShowUpload(!showUpload)}
                        activeOpacity={0.85}
                    >
                        <Text style={s.uploadBtnText}>+ Upload</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Upload panel */}
            {showUpload && tab !== 'search' && (
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
                {(['my', 'public', 'liked', 'search'] as Tab[]).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[s.tab, tab === t && s.tabActive]}
                        onPress={() => setTab(t)}
                        activeOpacity={0.85}
                    >
                        <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                            {t === 'my' ? `My (${myTracks.length})` :
                                t === 'public' ? `Free (${publicTracks.length})` :
                                    t === 'liked' ? `Liked (${likedTrks.length})` :
                                        '🔍 Search'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Search bar */}
            {tab === 'search' && (
                <View style={s.searchContainer}>
                    <View style={s.searchBar}>
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search for songs, artists, albums..."
                            placeholderTextColor={Colors.textMuted}
                            value={searchQuery}
                            onChangeText={handleSearchQueryChange}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {searching && (
                            <View style={s.searchIndicator}>
                                <ActivityIndicator color={Colors.primary} size="small" />
                            </View>
                        )}
                        {searchQuery.length > 0 && !searching && (
                            <TouchableOpacity
                                style={s.clearBtn}
                                onPress={() => {
                                    setSearchQuery('');
                                    setSearchResults([]);
                                    if (searchTimeoutRef.current) {
                                        clearTimeout(searchTimeoutRef.current);
                                    }
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={s.clearBtnText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {searchQuery.length > 0 && (
                        <Text style={s.searchHint}>
                            {searching ? 'Searching...' :
                                searchResults.length > 0 ? `Found ${searchResults.length} results` :
                                    searchQuery.length < 3 ? 'Type at least 3 characters to search' :
                                        'No results found'}
                        </Text>
                    )}
                </View>
            )}

            {/* Track list */}
            {loading && tab !== 'search' ? (
                <View style={s.center}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                </View>
            ) : tab === 'search' && searchResults.length === 0 && !searching && searchQuery.length === 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>🎵</Text>
                    <Text style={s.emptyTitle}>Search Free Music</Text>
                    <Text style={s.emptyDesc}>
                        Find and play full songs from independent artists
                    </Text>
                </View>
            ) : tab === 'search' && searchResults.length === 0 && !searching && searchQuery.length > 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
                    <Text style={s.emptyTitle}>No Results Found</Text>
                    <Text style={s.emptyDesc}>
                        Try different keywords or check your spelling
                    </Text>
                </View>
            ) : currentTracks.length === 0 && tab !== 'search' ? (
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
                    contentContainerStyle={{ paddingBottom: currentlyPlaying ? 200 : 100 }}
                    refreshControl={
                        tab !== 'search' ? (
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={Colors.primary}
                            />
                        ) : undefined
                    }
                >
                    {currentTracks.map((track, i) => (
                        <View
                            key={track.id}
                            style={[s.trackRow, i < currentTracks.length - 1 && s.trackBorder]}
                        >
                            <TouchableOpacity
                                style={[
                                    s.playButton,
                                    (!track.preview_url && !track.previewUrl && !track.fileUrl && !track.external_id && !track.externalId) && s.playButtonDisabled
                                ]}
                                onPress={() => handlePlayTrack(track)}
                                activeOpacity={0.8}
                                disabled={!track.preview_url && !track.previewUrl && !track.fileUrl && !track.external_id && !track.externalId}
                            >
                                {currentlyPlaying === track.id && isPlaying ? (
                                    <Text style={s.playIcon}>⏸️</Text>
                                ) : (!track.preview_url && !track.previewUrl && !track.fileUrl && !track.external_id && !track.externalId) ? (
                                    <Text style={s.playIcon}>🔍</Text>
                                ) : (
                                    <Text style={s.playIcon}>▶️</Text>
                                )}
                                {/* Preview indicator for YouTube tracks */}
                                {(tab === 'search' && track.preview_url) ||
                                    (tab !== 'search' && track.previewUrl) ? (
                                    <View style={s.previewBadge}>
                                        <Text style={s.previewBadgeText}>FULL</Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>

                            <View style={s.trackInfo}>
                                <Text style={s.trackTitle} numberOfLines={1}>
                                    {track.name || track.title}
                                </Text>
                                <Text style={s.trackMeta}>
                                    {track.artist}
                                    {track.album && ` · ${track.album}`}
                                    {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                                    {tab === 'search' && (
                                        <Text style={s.sourceTag}> · {track.source === 'youtube' ? 'YouTube' : 'JioSaavn'}</Text>
                                    )}
                                    {tab !== 'search' && track.externalSource === 'youtube' && (
                                        <Text style={s.sourceTag}> · YouTube</Text>
                                    )}
                                    {((tab === 'search' && track.preview_url) ||
                                        (tab !== 'search' && track.previewUrl)) && (
                                            <Text style={s.previewTag}> · 🎵 Full Song</Text>
                                        )}
                                </Text>
                                {currentlyPlaying === track.id && isPlaying && (
                                    <Text style={s.nowPlaying}>♪ Now Playing</Text>
                                )}
                            </View>

                            <View style={s.trackActions}>
                                {tab === 'search' ? (
                                    (() => {
                                        const isAdded = isTrackAlreadyAdded(track as ExternalTrack);
                                        const isAdding = addingTrack === track.id;

                                        return (
                                            <TouchableOpacity
                                                onPress={() => !isAdded && handleAddExternalTrack(track as ExternalTrack)}
                                                style={[
                                                    isAdded ? s.addedBtn : s.addBtn,
                                                    isAdding && { opacity: 0.7 }
                                                ]}
                                                activeOpacity={isAdded ? 1 : 0.85}
                                                disabled={isAdded || isAdding}
                                            >
                                                {isAdding ? (
                                                    <ActivityIndicator color="#fff" size="small" />
                                                ) : isAdded ? (
                                                    <Text style={s.addedBtnText}>✓ Added</Text>
                                                ) : (
                                                    <Text style={s.addBtnText}>+ Add</Text>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })()
                                ) : (
                                    <>
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
                                    </>
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

            {/* Mini Player */}
            {currentlyPlaying && (
                <View style={s.miniPlayer}>
                    {/* Timeline */}
                    <View style={s.miniTimeline}>
                        <View style={s.miniTimelineTrack} {...timelinePanResponder.panHandlers}>
                            <View
                                ref={timelineRef}
                                style={s.miniTimelineContainer}
                                onLayout={(event) => {
                                    const { width } = event.nativeEvent.layout;
                                    setTimelineWidth(width);
                                }}
                            >
                                <View style={s.miniTimelineBackground}>
                                    <View
                                        style={[
                                            s.miniTimelineFill,
                                            {
                                                width: (isFinite(playbackDuration) && playbackDuration > 0 && isFinite(playbackPosition))
                                                    ? `${Math.min(Math.max((playbackPosition / playbackDuration) * 100, 0), 100)}%`
                                                    : '0%'
                                            }
                                        ]}
                                    />
                                    <View
                                        style={[
                                            s.miniTimelineThumb,
                                            timelinePressed && s.miniTimelineThumbPressed,
                                            {
                                                left: (isFinite(playbackDuration) && playbackDuration > 0 && isFinite(playbackPosition))
                                                    ? `${Math.min(Math.max((playbackPosition / playbackDuration) * 100, 0), 97)}%`
                                                    : '0%'
                                            }
                                        ]}
                                    />
                                </View>
                            </View>
                        </View>
                        <View style={s.miniTimeRow}>
                            <Text style={s.miniTimeText}>{formatTime(playbackPosition)}</Text>
                            <Text style={s.miniTimeText}>{formatTime(playbackDuration)}</Text>
                        </View>
                    </View>

                    <View style={s.miniPlayerContent}>
                        <TouchableOpacity
                            style={s.miniPlayButton}
                            onPress={() => {
                                const track = audioPlayer.getCurrentTrack();
                                if (track) handlePlayTrack(track);
                            }}
                            activeOpacity={0.8}
                        >
                            <Text style={s.miniPlayIcon}>
                                {isPlaying ? '⏸️' : '▶️'}
                            </Text>
                        </TouchableOpacity>

                        <View style={s.miniTrackInfo}>
                            <Text style={s.miniTrackTitle} numberOfLines={1}>
                                {(() => {
                                    const track = audioPlayer.getCurrentTrack();
                                    return track?.name || track?.title || 'Unknown Track';
                                })()}
                            </Text>
                            <Text style={s.miniTrackArtist} numberOfLines={1}>
                                {(() => {
                                    const track = audioPlayer.getCurrentTrack();
                                    return track?.artist || 'Unknown Artist';
                                })()}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={s.miniStopButton}
                            onPress={async () => {
                                await audioPlayer.stop();
                                setCurrentlyPlaying(null);
                                setIsPlaying(false);
                                setPlaybackPosition(0);
                                setPlaybackDuration(0);
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={s.miniStopIcon}>✕</Text>
                        </TouchableOpacity>
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
        flexDirection: 'row', gap: 6,
        paddingHorizontal: 24, marginBottom: 12,
    },
    tab: {
        flex: 1, paddingVertical: 9,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 999, alignItems: 'center',
    },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 10, fontWeight: '600', color: Colors.textMuted },
    tabTextActive: { color: '#fff' },

    // Search styles
    searchContainer: { paddingHorizontal: 24, marginBottom: 16 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    searchInput: {
        flex: 1,
        backgroundColor: Colors.input,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 11, padding: 12, paddingHorizontal: 14,
        paddingRight: 50, // Make room for search indicator
        fontSize: 14, color: Colors.text,
    },
    searchIndicator: {
        position: 'absolute',
        right: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clearBtn: {
        position: 'absolute',
        right: 14,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },
    clearBtnText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
    searchHint: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 8,
        paddingHorizontal: 4,
    },
    searchBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16,
        minWidth: 70, alignItems: 'center', justifyContent: 'center',
    },
    searchBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    addBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
    },
    addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    addedBtn: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)', // Green background with transparency
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)', // Green border
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    addedBtnText: {
        color: '#22C55E', // Green text
        fontSize: 12,
        fontWeight: '700'
    },

    noAudioBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
    },
    noAudioBtnText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },

    sourceTag: {
        color: Colors.primary,
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },

    previewTag: {
        color: '#FF6B35',
        fontSize: 11,
        fontWeight: '600',
    },

    trackImageContainer: {
        width: '100%', height: '100%',
        alignItems: 'center', justifyContent: 'center',
    },

    scroll: { flex: 1 },
    trackRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 24, paddingVertical: 14,
    },
    trackBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },

    playButton: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
        position: 'relative',
    },
    playButtonDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        shadowOpacity: 0,
        elevation: 0,
    },
    playIcon: { fontSize: 18, marginLeft: 2 }, // Slight offset for visual centering

    previewBadge: {
        position: 'absolute',
        top: -4, right: -4,
        backgroundColor: '#FF6B35',
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 1,
        minWidth: 20,
        alignItems: 'center',
    },
    previewBadgeYoutube: {
        backgroundColor: '#FF0000', // YouTube red
    },
    previewBadgeInfo: {
        position: 'absolute',
        top: -4, right: -4,
        backgroundColor: '#6B7280', // Gray for info-only tracks
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 1,
        minWidth: 20,
        alignItems: 'center',
    },
    previewBadgeText: {
        color: '#fff',
        fontSize: 8,
        fontWeight: '700',
        textAlign: 'center',
    },

    trackIcon: {
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: 'rgba(123,110,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    trackInfo: { flex: 1 },
    trackTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
    trackMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    nowPlaying: {
        fontSize: 11,
        color: Colors.primary,
        fontWeight: '600',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
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

    // Mini Player
    miniPlayer: {
        position: 'absolute',
        bottom: 80, // Above bottom nav
        left: 24, right: 24,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    },
    miniTimeline: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    miniTimelineTrack: {
        marginBottom: 6,
    },
    miniTimelineContainer: {
        height: 20, // Larger touch area
        justifyContent: 'center',
    },
    miniTimelineBackground: {
        height: 3,
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        position: 'relative',
    },
    miniTimelineFill: {
        height: '100%',
        borderRadius: 1.5,
        backgroundColor: Colors.primary,
    },
    miniTimelineThumb: {
        position: 'absolute',
        top: -4,
        width: 11,
        height: 11,
        borderRadius: 5.5,
        backgroundColor: Colors.primary,
        marginLeft: -5.5,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.6,
        shadowRadius: 2,
        elevation: 2,
    },
    miniTimelineThumbPressed: {
        width: 15,
        height: 15,
        borderRadius: 7.5,
        marginLeft: -7.5,
        top: -6,
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 4,
    },
    miniTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    miniTimeText: {
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    miniPlayerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingTop: 0,
        gap: 12,
    },
    miniPlayButton: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    miniPlayIcon: { fontSize: 14 },
    miniTrackInfo: { flex: 1 },
    miniTrackTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 2,
    },
    miniTrackArtist: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    miniStopButton: {
        width: 28, height: 28,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 14,
    },
    miniStopIcon: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
    },

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