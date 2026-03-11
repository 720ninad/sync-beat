import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../../constants/Theme';
import { toast } from '../../src/lib/toast';
import Loader from '../../src/components/Loader';
import { changeUserPassword } from '../../src/lib/auth';

export default function ChangePasswordScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    const getStrength = () => {
        if (newPassword.length === 0) return null;
        if (newPassword.length < 6) return { label: 'Too short', color: '#F87171', width: '20%' };
        if (newPassword.length < 8) return { label: 'Weak', color: '#FBBF24', width: '45%' };
        if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword))
            return { label: 'Fair', color: '#FBBF24', width: '65%' };
        return { label: 'Strong', color: '#2DD4BF', width: '100%' };
    };

    const strength = getStrength();

    const handleSave = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('All fields are required');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (currentPassword === newPassword) {
            toast.error('New password must be different from current');
            return;
        }
        try {
            setSaving(true);
            await changeUserPassword({ currentPassword, newPassword });
            toast.success('Password changed successfully 🔒', 'Done');
            setTimeout(() => router.back(), 800);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Failed to change password');
        } finally {
            setSaving(false);
        }
    };


    return (
        <>
            {saving && <Loader message="Updating password..." />}
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
                        <Text style={s.headerTitle}>Change Password</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    {/* Lock icon */}
                    <View style={s.iconSection}>
                        <View style={s.iconBox}>
                            <Text style={{ fontSize: 36 }}>🔒</Text>
                        </View>
                        <Text style={s.iconTitle}>Update your password</Text>
                        <Text style={s.iconSubtitle}>Choose a strong password to keep your account secure.</Text>
                    </View>

                    {/* Fields */}
                    <View style={s.fields}>

                        {/* Current password */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>CURRENT PASSWORD</Text>
                            <View style={s.passwordWrap}>
                                <TextInput
                                    style={s.passwordInput}
                                    placeholder="Your current password"
                                    placeholderTextColor={Colors.textMuted}
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                    secureTextEntry={!showCurrent}
                                />
                                <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={s.eyeBtn}>
                                    <Text style={{ fontSize: 18 }}>{showCurrent ? '🙈' : '👁'}</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                                <Text style={s.forgotLink}>Forgot your password?</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Divider */}
                        <View style={s.divider} />

                        {/* New password */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>NEW PASSWORD</Text>
                            <View style={s.passwordWrap}>
                                <TextInput
                                    style={s.passwordInput}
                                    placeholder="Enter new password"
                                    placeholderTextColor={Colors.textMuted}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry={!showNew}
                                />
                                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={s.eyeBtn}>
                                    <Text style={{ fontSize: 18 }}>{showNew ? '🙈' : '👁'}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Strength bar */}
                            {strength && (
                                <View style={s.strengthWrap}>
                                    <View style={s.strengthTrack}>
                                        <View style={[s.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                                    </View>
                                    <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                                </View>
                            )}

                            {/* Requirements */}
                            <View style={s.requirements}>
                                <Req met={newPassword.length >= 6} text="At least 6 characters" />
                                <Req met={newPassword.length >= 8} text="At least 8 characters" />
                                <Req met={/[A-Z]/.test(newPassword)} text="One uppercase letter" />
                                <Req met={/[0-9]/.test(newPassword)} text="One number" />
                            </View>
                        </View>

                        {/* Confirm password */}
                        <View style={s.fieldGroup}>
                            <Text style={s.label}>CONFIRM NEW PASSWORD</Text>
                            <View style={[
                                s.passwordWrap,
                                confirmPassword.length > 0 && newPassword !== confirmPassword && s.passwordWrapError,
                                confirmPassword.length > 0 && newPassword === confirmPassword && s.passwordWrapSuccess,
                            ]}>
                                <TextInput
                                    style={s.passwordInput}
                                    placeholder="Repeat new password"
                                    placeholderTextColor={Colors.textMuted}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirm}
                                />
                                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={s.eyeBtn}>
                                    <Text style={{ fontSize: 18 }}>{showConfirm ? '🙈' : '👁'}</Text>
                                </TouchableOpacity>
                            </View>
                            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                <Text style={s.errorText}>Passwords do not match</Text>
                            )}
                            {confirmPassword.length > 0 && newPassword === confirmPassword && (
                                <Text style={s.successText}>✓ Passwords match</Text>
                            )}
                        </View>

                    </View>
                </ScrollView>

                {/* Bottom bar */}
                <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <TouchableOpacity
                        style={[s.saveBtn, saving && { opacity: 0.7 }]}
                        onPress={handleSave}
                        activeOpacity={0.85}
                        disabled={saving}
                    >
                        <Text style={s.saveBtnText}>
                            {saving ? 'Updating...' : 'Update Password'}
                        </Text>
                    </TouchableOpacity>
                </View>

            </KeyboardAvoidingView>
        </>
    );
}

function Req({ met, text }: { met: boolean; text: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: met ? '#2DD4BF' : '#454568' }}>
                {met ? '✓' : '○'}
            </Text>
            <Text style={{ fontSize: 12, color: met ? '#2DD4BF' : '#454568' }}>{text}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 120 },

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
    headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

    iconSection: {
        alignItems: 'center', paddingVertical: 28,
        paddingHorizontal: 40, gap: 12,
    },
    iconBox: {
        width: 80, height: 80, borderRadius: 26,
        backgroundColor: 'rgba(251,191,36,0.1)',
        borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    iconTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    iconSubtitle: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },

    fields: { paddingHorizontal: 24, gap: 20 },
    fieldGroup: { gap: 8 },
    label: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1,
        color: Colors.textDim, textTransform: 'uppercase',
    },

    passwordWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.input,
        borderRadius: 13, borderWidth: 1, borderColor: Colors.border,
    },
    passwordWrapError: { borderColor: '#F87171' },
    passwordWrapSuccess: { borderColor: '#2DD4BF' },
    passwordInput: {
        flex: 1, paddingVertical: 14, paddingHorizontal: 18,
        fontSize: 15, color: Colors.text,
    },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },

    forgotLink: {
        fontSize: 13, color: Colors.primary,
        fontWeight: '600', textAlign: 'right',
    },

    divider: { height: 1, backgroundColor: Colors.border },

    strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    strengthTrack: {
        flex: 1, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
    },
    strengthFill: { height: '100%', borderRadius: 2 },
    strengthLabel: { fontSize: 11, fontWeight: '700', width: 60, textAlign: 'right' },

    requirements: { gap: 6, marginTop: 4 },

    errorText: { fontSize: 12, color: '#F87171', marginTop: 2 },
    successText: { fontSize: 12, color: '#2DD4BF', marginTop: 2 },

    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24, paddingTop: 16,
        backgroundColor: 'rgba(7,7,16,0.95)',
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    saveBtn: {
        backgroundColor: Colors.primary,
        borderRadius: 999, padding: 16, alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});