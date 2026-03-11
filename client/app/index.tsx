import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, CommonStyles } from '../constants/Theme';

export default function SplashScreen() {
    const router = useRouter();

    return (
        <View style={s.container}>

            {/* Radial gradient background — web only */}
            {Platform.OS === 'web' && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: `
            radial-gradient(ellipse 130% 70% at 50% 110%, rgba(123,110,255,0.5) 0%, transparent 55%),
            radial-gradient(ellipse 70% 50% at 85% 15%, rgba(45,212,191,0.2) 0%, transparent 50%),
            ${Colors.background}
          `,
                    zIndex: 0,
                } as any} />
            )}

            {/* Blurred orbs */}
            {Platform.OS === 'web' ? (
                <>
                    <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: Colors.primary, filter: 'blur(60px)', opacity: 0.3, top: '20%', left: '4%', zIndex: 1 } as any} />
                    <div style={{ position: 'absolute', width: 110, height: 110, borderRadius: '50%', background: Colors.secondary, filter: 'blur(50px)', opacity: 0.25, top: '13%', right: '8%', zIndex: 1 } as any} />
                    <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', background: Colors.accent, filter: 'blur(45px)', opacity: 0.2, bottom: '28%', right: '6%', zIndex: 1 } as any} />
                </>
            ) : (
                <>
                    <View style={[s.orb, { width: 180, height: 180, top: '20%', left: '4%', backgroundColor: Colors.primary, opacity: 0.25 }]} />
                    <View style={[s.orb, { width: 110, height: 110, top: '13%', right: '8%', backgroundColor: Colors.secondary, opacity: 0.2 }]} />
                    <View style={[s.orb, { width: 90, height: 90, bottom: '28%', right: '6%', backgroundColor: Colors.accent, opacity: 0.15 }]} />
                </>
            )}

            {/* Content */}
            <View style={s.content}>

                {/* Top */}
                <View style={s.top}>
                    <View style={s.logoBox}>
                        <Text style={{ fontSize: 38 }}>🎵</Text>
                    </View>
                    <Text style={s.appName}>SyncBeat</Text>
                    <Text style={s.tagline}>
                        Call your friends.{'\n'}Hear the same beat — together.
                    </Text>
                </View>

                {/* Bottom buttons */}
                <View style={s.bottom}>
                    <TouchableOpacity
                        style={s.btnPrimary}
                        activeOpacity={0.85}
                        onPress={() => router.push('/signup')}
                    >
                        <Text style={s.btnPrimaryText}>Get Started →</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={s.btnGhost}
                        activeOpacity={0.85}
                        onPress={() => router.push('/login')}
                    >
                        <Text style={s.btnGhostText}>I have an account</Text>
                    </TouchableOpacity>
                    <Text style={s.fineprint}>Free forever · No credit card</Text>
                </View>

            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        ...CommonStyles.container,
        overflow: 'hidden',
    },
    orb: {
        position: 'absolute',
        borderRadius: 999,
    },
    content: {
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        zIndex: 2,
        padding: 32,
        paddingTop: 80,
        paddingBottom: 48,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    top: {
        alignItems: 'center',
        gap: 18,
    },
    logoBox: {
        width: 88,
        height: 88,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.55,
        shadowRadius: 28,
        elevation: 20,
    },
    appName: {
        fontSize: 36,
        fontWeight: '800',
        color: Colors.text,
        letterSpacing: -1.5,
    },
    tagline: {
        fontSize: 16,
        color: Colors.textDim,
        textAlign: 'center',
        lineHeight: 26,
    },
    bottom: {
        width: '100%',
        gap: 13,
    },
    btnPrimary: CommonStyles.btnPrimary,
    btnPrimaryText: CommonStyles.btnPrimaryText,
    btnGhost: CommonStyles.btnGhost,
    btnGhostText: CommonStyles.btnGhostText,
    fineprint: {
        color: '#404060',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 4,
    },
});
