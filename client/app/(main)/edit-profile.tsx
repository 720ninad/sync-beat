import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../../constants/Theme';
import { getMe, updateProfile } from '../../src/lib/auth';
import { toast } from '../../src/lib/toast';
import Loader from '../../src/components/Loader';

export default function EditProfileScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getMe()
            .then((user) => {
                if (user) {
                    setName(user.name || '');
                    setUsername(user.username || '');
                    setEmail(user.email || '');
                    setBio(user.bio || '');
                }
            })
            .catch(() => router.replace('/'))
            .finally(() => setLoading(false));
    }, []);

    const getInitial = () => name?.charAt(0).toUpperCase() || 'A';

    const handleSave = async () => {
        if (!name || !username || !email) {
            toast.error('Name, username and email are required');
            return;
        }
        try {
            setSaving(true);
            await updateProfile({ name, username, email, bio });
            toast.success('Profile updated successfully 🎉', 'Saved');
            setTimeout(() => router.back(), 800);
        } catch (err: any) {
            console.error('Update profile error:', err);
            toast.error(err?.response?.data?.error || 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Loader message="Loading profile..." />;

    return (
        <>
            {saving && <Loader message="Saving changes..." />}
            <KeyboardAvoidingView
                style={s.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    style={s.scroll}
                    contentContainerStyle={s.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
                        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                            <Text style={s.backBtnText}>←</Text>
                        </TouchableOpacity>
                        <Text style={s.headerTitle}>Edit Profile</Text>
                        <TouchableOpacity onPress={handleSave} activeOpacity={0.8}>
                            <Text style={s.saveBtn}>Save</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Avatar */}
                    <View style={s.avatarSection}>
                        <View style={s.avatarWrap}>
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>{getInitial()}</Text>
                            </View>
                            {/* Glow ring */}
                            <View style={s.avatarRing} />
                        </View>
                        <TouchableOpacity style={s.changePhotoBtn} activeOpacity={0.8}>
                            <Text style={s.changePhotoText}>📷  Change Photo</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Fields */}
                    <View style={s.fields}>

                        {/* Name */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>FULL NAME</Text>
                            <TextInput
                                style={s.input}
                                placeholder="Your full name"
                                placeholderTextColor={Colors.textMuted}
                                value={name}
                                onChangeText={setName}
                            />
                        </View>

                        {/* Username */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>USERNAME</Text>
                            <View style={s.inputWrap}>
                                <Text style={s.atSign}>@</Text>
                                <TextInput
                                    style={s.inputWithAt}
                                    placeholder="username"
                                    placeholderTextColor={Colors.textMuted}
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        {/* Email */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>EMAIL</Text>
                            <TextInput
                                style={s.input}
                                placeholder="your@email.com"
                                placeholderTextColor={Colors.textMuted}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        {/* Bio */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>BIO</Text>
                            <TextInput
                                style={s.textArea}
                                placeholder="Tell your friends something about you..."
                                placeholderTextColor={Colors.textMuted}
                                value={bio}
                                onChangeText={setBio}
                                multiline
                                numberOfLines={3}
                                maxLength={120}
                            />
                            <Text style={s.charCount}>{bio.length}/120</Text>
                        </View>

                        {/* Divider */}
                        <View style={s.divider} />

                        {/* Danger zone */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>ACCOUNT</Text>
                            <TouchableOpacity style={s.dangerBtn} activeOpacity={0.85}>
                                <View style={s.dangerIcon}>
                                    <Text style={{ fontSize: 16 }}>🔑</Text>
                                </View>
                                <Text onPress={() => router.push('/(main)/change-password')} style={s.dangerLabel}>Change Password</Text>
                                <Text style={s.dangerChevron}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.deleteBtn} activeOpacity={0.85}>
                                <View style={s.deleteIcon}>
                                    <Text style={{ fontSize: 16 }}>🗑</Text>
                                </View>
                                <Text style={s.deleteLabel}>Delete Account</Text>
                                <Text style={s.dangerChevron}>›</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </ScrollView>

                {/* Save button at bottom */}
                <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <TouchableOpacity
                        style={[s.saveBtnFull, saving && { opacity: 0.7 }]}
                        onPress={handleSave}
                        activeOpacity={0.85}
                        disabled={saving}
                    >
                        <Text style={s.saveBtnFullText}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Text>
                    </TouchableOpacity>
                </View>

            </KeyboardAvoidingView>
        </>
    );
}

const s = StyleSheet.create({
    container: { ...CommonStyles.container, },
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 120 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    backBtnText: { color: Colors.text, fontSize: 16 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
    saveBtn: { fontSize: 15, fontWeight: '700', color: Colors.primary },

    // Avatar
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 24,
        gap: 14,
    },
    avatarWrap: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: 96, height: 96, borderRadius: 32,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5, shadowRadius: 24, elevation: 16,
        zIndex: 1,
    },
    avatarRing: {
        position: 'absolute',
        width: 112, height: 112, borderRadius: 38,
        borderWidth: 1.5,
        borderColor: 'rgba(123,110,255,0.3)',
    },
    avatarText: { color: '#fff', fontWeight: '800', fontSize: 36 },
    changePhotoBtn: {
        backgroundColor: 'rgba(123,110,255,0.12)',
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: 'rgba(123,110,255,0.25)',
    },
    changePhotoText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

    // Fields
    fields: { paddingHorizontal: 24, gap: 20 },
    fieldGroup: { gap: 8 },
    label: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1,
        color: Colors.textDim, textTransform: 'uppercase',
    },
    input: {
        backgroundColor: Colors.input,
        borderRadius: 13,
        paddingVertical: 14,
        paddingHorizontal: 18,
        fontSize: 15,
        color: Colors.text,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.input,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 18,
    },
    atSign: {
        fontSize: 15, fontWeight: '700',
        color: Colors.primary, marginRight: 4,
    },
    inputWithAt: {
        flex: 1, paddingVertical: 14,
        fontSize: 15, color: Colors.text,
    },
    textArea: {
        backgroundColor: Colors.input,
        borderRadius: 13,
        padding: 16,
        fontSize: 15,
        color: Colors.text,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 90,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 11, color: Colors.textMuted,
        textAlign: 'right',
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 4,
    },

    // Danger zone
    dangerBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 13,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, padding: 14, marginBottom: 9,
    },
    dangerIcon: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: 'rgba(123,110,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    dangerLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },
    dangerChevron: { color: Colors.textMuted, fontSize: 18 },

    deleteBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 13,
        backgroundColor: 'rgba(248,113,113,0.05)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.14)',
        borderRadius: 16, padding: 14,
    },
    deleteIcon: {
        width: 36, height: 36, borderRadius: 11,
        backgroundColor: 'rgba(248,113,113,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    deleteLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#F87171' },

    // Bottom save bar
    bottomBar: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24,
        paddingTop: 16,
        backgroundColor: 'rgba(7,7,16,0.95)',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    saveBtnFull: {
        backgroundColor: Colors.primary,
        borderRadius: 999,
        padding: 16,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
        elevation: 10,
    },
    saveBtnFullText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});