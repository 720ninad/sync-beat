import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Colors } from '../../constants/Theme';

interface LoaderProps {
    message?: string;
}

export default function Loader({ message }: LoaderProps) {
    return (
        <View style={s.overlay}>
            <View style={s.box}>
                <ActivityIndicator size="large" color={Colors.primary} />
                {message && <Text style={s.message}>{message}</Text>}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(7,7,16,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
    },
    box: {
        backgroundColor: '#131326',
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(123,110,255,0.2)',
        minWidth: 160,
    },
    message: {
        color: '#8A8AAC',
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
});