import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../constants/Theme';
import { toast } from '../src/lib/toast';
import Loader from '../src/components/Loader';
import { sendForgotOtp, verifyForgotOtp, resetForgotPassword } from '../src/lib/auth';

type Step = 'email' | 'otp' | 'reset';

export default function ForgotPasswordScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSendOtp = async () => {
        if (!email) { toast.error('Please enter your email'); return; }
        try {
            setLoading(true);
            await sendForgotOtp(email);
            toast.success('Check your email for the code 📧', 'Code sent');
            setStep('otp');
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };


    const handleVerifyOtp = async () => {
        if (otp.length < 6) { toast.error('Enter the 6-digit code'); return; }
        try {
            setLoading(true);
            await verifyForgotOtp(email, otp);
            setStep('reset');
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Invalid or expired code');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
        try {
            setLoading(true);
            await resetForgotPassword(email, otp, newPassword);
            toast.success('Password reset successfully 🎉', 'Done');
            setTimeout(() => router.replace('/login'), 1000);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {loading && <Loader message={
                step === 'email' ? 'Sending code...' :
                    step === 'otp' ? 'Verifying...' : 'Resetting password...'
            } />}
            <KeyboardAvoidingView
                style={s.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Header */}
                <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
                    <TouchableOpacity
                        style={s.backBtn}
                        onPress={() => step === 'email' ? router.back() : setStep(step === 'otp' ? 'email' : 'otp')}
                        activeOpacity={0.8}
                    >
                        <Text style={s.backBtnText}>←</Text>
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>Forgot Password</Text>
                    <View style={{ width: 36 }} />
                </View>

                {/* Step indicator */}
                <View style={s.stepRow}>
                    {(['email', 'otp', 'reset'] as Step[]).map((s_, i) => (
                        <View key={s_} style={s.stepItem}>
                            <View style={[
                                s.stepDot,
                                step === s_ && s.stepDotActive,
                                (step === 'otp' && i === 0) && s.stepDotDone,
                                (step === 'reset' && i <= 1) && s.stepDotDone,
                            ]}>
                                {((step === 'otp' && i === 0) || (step === 'reset' && i <= 1)) ? (
                                    <Text style={{ fontSize: 10, color: '#fff' }}>✓</Text>
                                ) : (
                                    <Text style={[s.stepNum, step === s_ && { color: '#fff' }]}>{i + 1}</Text>
                                )}
                            </View>
                            {i < 2 && <View style={[s.stepLine, (step === 'otp' && i === 0) || (step === 'reset' && i <= 1) ? s.stepLineDone : null]} />}
                        </View>
                    ))}
                </View>

                <View style={s.content}>

                    {/* STEP 1 — Email */}
                    {step === 'email' && (
                        <View style={s.stepContent}>
                            <View style={s.iconBox}>
                                <Text style={{ fontSize: 36 }}>📧</Text>
                            </View>
                            <Text style={s.stepTitle}>Enter your email</Text>
                            <Text style={s.stepSubtitle}>
                                We'll send a 6-digit code to reset your password.
                            </Text>
                            <View style={s.fieldGroup}>
                                <Text style={s.label}>EMAIL ADDRESS</Text>
                                <TextInput
                                    style={s.input}
                                    placeholder="alex@mail.com"
                                    placeholderTextColor={Colors.textMuted}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoFocus
                                />
                            </View>
                            <TouchableOpacity style={s.primaryBtn} onPress={handleSendOtp} activeOpacity={0.85}>
                                <Text style={s.primaryBtnText}>Send Reset Code</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 2 — OTP */}
                    {step === 'otp' && (
                        <View style={s.stepContent}>
                            <View style={s.iconBox}>
                                <Text style={{ fontSize: 36 }}>🔢</Text>
                            </View>
                            <Text style={s.stepTitle}>Check your email</Text>
                            <Text style={s.stepSubtitle}>
                                We sent a 6-digit code to{'\n'}
                                <Text style={{ color: Colors.text, fontWeight: '700' }}>{email}</Text>
                            </Text>
                            <View style={s.fieldGroup}>
                                <Text style={s.label}>6-DIGIT CODE</Text>
                                <TextInput
                                    style={[s.input, s.otpInput]}
                                    placeholder="000000"
                                    placeholderTextColor={Colors.textMuted}
                                    value={otp}
                                    onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    autoFocus
                                />
                            </View>
                            <TouchableOpacity style={s.primaryBtn} onPress={handleVerifyOtp} activeOpacity={0.85}>
                                <Text style={s.primaryBtnText}>Verify Code</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSendOtp} style={s.resendBtn}>
                                <Text style={s.resendText}>
                                    Didn't get it?{' '}
                                    <Text style={{ color: Colors.primary, fontWeight: '700' }}>Resend</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 3 — New password */}
                    {step === 'reset' && (
                        <View style={s.stepContent}>
                            <View style={s.iconBox}>
                                <Text style={{ fontSize: 36 }}>🔑</Text>
                            </View>
                            <Text style={s.stepTitle}>Set new password</Text>
                            <Text style={s.stepSubtitle}>
                                Choose a strong password you haven't used before.
                            </Text>
                            <View style={s.fieldGroup}>
                                <Text style={s.label}>NEW PASSWORD</Text>
                                <View style={s.passwordWrap}>
                                    <TextInput
                                        style={s.passwordInput}
                                        placeholder="Enter new password"
                                        placeholderTextColor={Colors.textMuted}
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        secureTextEntry={!showPass}
                                        autoFocus
                                    />
                                    <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                                        <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁'}</Text>
                                    </TouchableOpacity>
                                </View>
                                {newPassword.length > 0 && (
                                    <View style={{ gap: 5, marginTop: 6 }}>
                                        <Req met={newPassword.length >= 6} text="At least 6 characters" />
                                        <Req met={/[A-Z]/.test(newPassword)} text="One uppercase letter" />
                                        <Req met={/[0-9]/.test(newPassword)} text="One number" />
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity style={s.primaryBtn} onPress={handleReset} activeOpacity={0.85}>
                                <Text style={s.primaryBtnText}>Reset Password</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                </View>
            </KeyboardAvoidingView>
        </>
    );
}

function Req({ met, text }: { met: boolean; text: string }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: met ? '#2DD4BF' : '#454568' }}>{met ? '✓' : '○'}</Text>
            <Text style={{ fontSize: 12, color: met ? '#2DD4BF' : '#454568' }}>{text}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,

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

    // Step indicator
    stepRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 48, marginBottom: 8,
    },
    stepItem: { flexDirection: 'row', alignItems: 'center' },
    stepDot: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    stepDotDone: { backgroundColor: '#2DD4BF', borderColor: '#2DD4BF' },
    stepNum: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
    stepLine: { width: 48, height: 1, backgroundColor: Colors.border, marginHorizontal: 4 },
    stepLineDone: { backgroundColor: '#2DD4BF' },

    content: { flex: 1 },
    stepContent: {
        flex: 1, paddingHorizontal: 24,
        paddingTop: 16, gap: 20,
        alignItems: 'center',
    },

    iconBox: {
        width: 80, height: 80, borderRadius: 26,
        backgroundColor: 'rgba(123,110,255,0.12)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    stepSubtitle: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },

    fieldGroup: { width: '100%', gap: 8 },
    label: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1,
        color: Colors.textDim, textTransform: 'uppercase',
    },
    input: {
        backgroundColor: Colors.input,
        borderRadius: 13, paddingVertical: 14, paddingHorizontal: 18,
        fontSize: 15, color: Colors.text,
        borderWidth: 1, borderColor: Colors.border,
        width: '100%',
    },
    otpInput: {
        fontSize: 28, fontWeight: '800',
        textAlign: 'center', letterSpacing: 10,
    },

    passwordWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.input,
        borderRadius: 13, borderWidth: 1, borderColor: Colors.border,
    },
    passwordInput: {
        flex: 1, paddingVertical: 14, paddingHorizontal: 18,
        fontSize: 15, color: Colors.text,
    },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },

    primaryBtn: {
        width: '100%', backgroundColor: Colors.primary,
        borderRadius: 999, padding: 16, alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    resendBtn: { marginTop: -8 },
    resendText: { fontSize: 13, color: Colors.textDim, textAlign: 'center' },
});