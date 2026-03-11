import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, CommonStyles } from '../../constants/Theme';

export default function HomeEmptyScreen() {
    const router = useRouter();

    return (
        <View style={s.container}>

            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.greeting}>Welcome!</Text>
                    <Text style={s.name}>Hey, Alex</Text>
                </View>
                <View style={s.avatar}>
                    <Text style={s.avatarText}>A</Text>
                </View>
            </View>

            {/* Empty center */}
            <View style={s.center}>
                <View style={s.iconBox}>
                    <Text style={{ fontSize: 38 }}>👥</Text>
                </View>

                <View style={s.textBlock}>
                    <Text style={s.emptyTitle}>No friends yet</Text>
                    <Text style={s.emptyDesc}>
                        Add a friend to start calling and listening to music together in sync.
                    </Text>
                </View>

                <View style={s.buttons}>
                    <TouchableOpacity
                        style={s.btnPrimary}
                        activeOpacity={0.85}
                        onPress={() => router.push('/add-friend')}
                    >
                        <Text style={s.btnPrimaryText}>Add Your First Friend</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnGhost} activeOpacity={0.85}>
                        <Text style={s.btnGhostText}>Share My Username</Text>
                    </TouchableOpacity>
                </View>

                <Text style={s.username}>
                    Your username:{' '}
                    <Text style={s.usernameValue}>@alexj</Text>
                </Text>
            </View>

            {/* Bottom nav */}
            <View style={s.bnav}>
                <TouchableOpacity style={s.navItem}>
                    <Text style={s.navIcon}>🏠</Text>
                    <Text style={[s.navLabel, s.navActive]}>Home</Text>
                    <View style={s.navDot} />
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.replace('/(main)/library')}>
                    <Text style={s.navIcon}>🎵</Text>
                    <Text style={s.navLabel}>Library</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.navItem} onPress={() => router.replace('/(main)/profile')}>
                    <Text style={s.navIcon}>👤</Text>
                    <Text style={s.navLabel}>Profile</Text>
                </TouchableOpacity>
            </View>

        </View>
    );
}

const s = StyleSheet.create({
    container: CommonStyles.container,
    header: CommonStyles.header,
    greeting: { fontSize: 13, color: Colors.textDim },
    name: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginTop: 2 },
    avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    center: {
        flex: 1,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 40, paddingBottom: 40, gap: 20,
    },
    iconBox: {
        width: 88, height: 88, borderRadius: 28,
        backgroundColor: 'rgba(123,110,255,0.15)',
        borderWidth: 1, borderColor: 'rgba(123,110,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    textBlock: { alignItems: 'center', gap: 10 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    emptyDesc: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },

    buttons: { width: '100%', gap: 12 },
    btnPrimary: CommonStyles.btnPrimary,
    btnPrimaryText: CommonStyles.btnPrimaryText,
    btnGhost: CommonStyles.btnGhost,
    btnGhostText: CommonStyles.btnGhostText,

    username: { fontSize: 12, color: Colors.textMuted },
    usernameValue: { color: Colors.secondary, fontWeight: '700', fontSize: 14, fontFamily: 'monospace' },

    bnav: CommonStyles.bnav,
    navItem: { alignItems: 'center', gap: 4, position: 'relative' },
    navIcon: { fontSize: 22 },
    navLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
    navActive: { color: '#9B90FF' },
    navDot: { position: 'absolute', bottom: -7, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary },
});
