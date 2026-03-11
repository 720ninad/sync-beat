import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, CommonStyles } from '../constants/Theme';
import { registerUser } from '../src/lib/auth';
import { toast } from '../src/lib/toast';
import Loader from '../src/components/Loader';

export default function SignupScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async () => {
        if (!name || !username || !email || !password) {
            toast.error('All fields are required');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        try {
            setLoading(true);
            await registerUser({ name, username, email, password });
            toast.success('Welcome to SyncBeat! 🎵', 'Account created');
            setTimeout(() => router.replace('/(main)/home'), 1000);
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {loading && <Loader message="Creating your account..." />}
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
                    <View style={[s.backRow, { paddingTop: Math.max(insets.top, 16) }]}>
                        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                            <Text style={s.backBtnText}>←</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.titleBlock}>
                        <Text style={s.title}>Create your{'\n'}account 👋</Text>
                        <Text style={s.subtitle}>Free forever. Takes 30 seconds.</Text>
                    </View>

                    <View style={s.fields}>
                        <View>
                            <Text style={s.label}>YOUR NAME</Text>
                            <TextInput style={s.input} placeholder="Alex Johnson" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} />
                        </View>
                        <View>
                            <Text style={s.label}>USERNAME</Text>
                            <View style={s.inputWrap}>
                                <TextInput style={[s.input, s.inputWithBadge]} placeholder="@alexj" placeholderTextColor={Colors.textMuted} value={username} onChangeText={setUsername} autoCapitalize="none" />
                                {username.length > 0 && <Text style={s.available}>✓ Available</Text>}
                            </View>
                        </View>
                        <View>
                            <Text style={s.label}>EMAIL</Text>
                            <TextInput style={s.input} placeholder="alex@mail.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                        </View>
                        <View>
                            <Text style={s.label}>PASSWORD</Text>
                            <View style={s.passwordWrap}>
                                <TextInput style={s.passwordInput} placeholder="••••••••" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
                                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                                    <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{ marginTop: 8, gap: 12 }}>
                            <TouchableOpacity style={[s.btnPrimary, loading && { opacity: 0.7 }]} activeOpacity={0.85} onPress={handleRegister} disabled={loading}>
                                <Text style={s.btnPrimaryText}>Create Account</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push('/login')}>
                                <Text style={s.switchText}>
                                    Already have an account?{' '}
                                    <Text style={{ color: Colors.primary, fontWeight: '600' }}>Sign in</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={s.terms}>By signing up, you agree to our Terms & Privacy Policy</Text>
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
    inputWrap: { position: 'relative' },
    inputWithBadge: { paddingRight: 110 },
    available: {
        position: 'absolute', right: 16,
        top: 0, bottom: 0,
        fontSize: 12, fontWeight: '700', color: Colors.secondary,
        textAlignVertical: 'center',
        ...(Platform.OS === 'web' ? { lineHeight: '48px' } as any : { lineHeight: 48 }),
    },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.input, borderRadius: 13, borderWidth: 1, borderColor: Colors.border },
    passwordInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 18, fontSize: 14, color: Colors.text },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
    errorText: { color: '#F87171', fontSize: 13, textAlign: 'center' },
    btnPrimary: CommonStyles.btnPrimary,
    btnPrimaryText: CommonStyles.btnPrimaryText,
    switchText: { color: Colors.textDim, fontSize: 13, textAlign: 'center' },
    terms: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', paddingTop: 4 },
});