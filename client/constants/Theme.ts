import { StyleSheet, Platform } from 'react-native';

export const Colors = {
    background: '#070710',
    card: '#131326',
    input: '#191932',
    primary: '#7B6EFF',
    secondary: '#2DD4BF',
    accent: '#F472B6',
    text: '#EEEEFF',
    textDim: '#8A8AAC',
    textMuted: '#454568',
    border: 'rgba(255,255,255,0.07)',
    bg: '#070710',
    purpleD: 'rgba(123,110,255,0.15)',
};

export const CommonStyles = {
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    btnPrimary: {
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
    btnPrimaryText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    btnGhost: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 999,
        padding: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    btnGhostText: {
        color: Colors.textDim,
        fontSize: 14,
        fontWeight: '600',
    },
    input: {
        backgroundColor: Colors.input,
        borderRadius: 13,
        paddingVertical: 14,
        paddingHorizontal: 18,
        fontSize: 14,
        color: Colors.text,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        paddingTop: Platform.OS === 'ios' ? 28 : 28, // base value
        paddingBottom: 20,
    },
    backBtn: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleLarge: {
        fontSize: 30,
        fontWeight: '800',
        color: Colors.text,
        letterSpacing: -0.8,
    },
    bnav: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 14,
        paddingBottom: 32,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(7,7,16,0.98)',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    // Call UI
    callAvatar: {
        width: 110,
        height: 110,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 16,
        zIndex: 2,
    },
    ring: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 2,
        borderColor: 'rgba(45,212,191,0.22)',
    },
    // List Items
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        paddingHorizontal: 24,
    },
    listItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    }
} as const;
