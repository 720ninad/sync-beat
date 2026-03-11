import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../constants/Theme';
import { loginUser } from '../src/lib/auth';
import { toast } from '../src/lib/toast';
import Loader from '../src/components/Loader';


export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!email || !password) {
            toast.error('All fields are required');
            return;
        }
        try {
            setLoading(true);
            await loginUser({ email, password });
            toast.success('Welcome back! 🎵', 'Signed in');
            setTimeout(() => router.replace('/(main)/home'), 1000);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {loading && <Loader message="Signing you in..." />}
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
                    {/* Back button */}
                    <View style={[s.backRow, { paddingTop: Math.max(insets.top, 16) }]}>
                        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                            <Text style={s.backBtnText}>←</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Title */}
                    <View style={s.titleBlock}>
                        <Text style={s.title}>Welcome{'\n'}back 👋</Text>
                        <Text style={s.subtitle}>Good to see you again.</Text>
                    </View>

                    {/* Fields */}
                    <View style={s.fields}>
                        <View>
                            <Text style={s.label}>EMAIL</Text>
                            <TextInput
                                style={s.input}
                                placeholder="alex@mail.com"
                                placeholderTextColor={Colors.textMuted}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View>
                            <View style={s.labelRow}>
                                <Text style={s.label}>PASSWORD</Text>
                                <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                                    <Text style={s.forgotLink}>Forgot password?</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={s.passwordWrap}>
                                <TextInput
                                    style={s.passwordInput}
                                    placeholder="••••••••"
                                    placeholderTextColor={Colors.textMuted}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPass}
                                />
                                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                                    <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Error */}
                        {error ? <Text style={s.errorText}>{error}</Text> : null}

                        <View style={{ marginTop: 8, gap: 12 }}>
                            <TouchableOpacity
                                style={[s.btnPrimary, loading && { opacity: 0.7 }]}
                                activeOpacity={0.85}
                                onPress={handleLogin}
                                disabled={loading}
                            >
                                <Text style={s.btnPrimaryText}>
                                    {loading ? 'Signing in...' : 'Sign In'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => router.push('/signup')}>
                                <Text style={s.switchText}>
                                    No account?{' '}
                                    <Text style={{ color: Colors.primary, fontWeight: '600' }}>Sign up</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </>

    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: 48 },
    backRow: { paddingHorizontal: 32, paddingBottom: 24 },
    backBtn: { ...CommonStyles.backBtn, backgroundColor: Colors.card },
    backBtnText: { color: Colors.text, fontSize: 16 },
    titleBlock: { paddingHorizontal: 32, paddingBottom: 32 },
    title: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.8, lineHeight: 36, marginBottom: 8 },
    subtitle: { fontSize: 14, color: Colors.textDim },
    fields: { paddingHorizontal: 32, gap: 16 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textDim, textTransform: 'uppercase', marginBottom: 6 },
    input: { backgroundColor: Colors.input, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 18, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.input, borderRadius: 13, borderWidth: 1, borderColor: Colors.border },
    passwordInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 18, fontSize: 14, color: Colors.text },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
    errorText: { color: '#F87171', fontSize: 13, textAlign: 'center' },
    btnPrimary: CommonStyles.btnPrimary,
    btnPrimaryText: CommonStyles.btnPrimaryText,
    switchText: { color: Colors.textDim, fontSize: 13, textAlign: 'center' },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    forgotLink: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.primary,
    },
});