import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Theme';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('💥 ErrorBoundary caught:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <View style={s.container}>
                <View style={s.card}>
                    <View style={s.iconWrap}>
                        <Text style={{ fontSize: 44 }}>💥</Text>
                    </View>

                    <Text style={s.title}>Something went wrong</Text>
                    <Text style={s.subtitle}>
                        The app ran into an unexpected error. Your data is safe.
                    </Text>

                    {__DEV__ && this.state.error && (
                        <View style={s.errorBox}>
                            <Text style={s.errorText} numberOfLines={6}>
                                {this.state.error.message}
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={s.btn}
                        onPress={this.handleReset}
                        activeOpacity={0.85}
                    >
                        <Text style={s.btnText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }
}

const s = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: Colors.bg,
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%', backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 24, padding: 28,
        alignItems: 'center', gap: 14,
    },
    iconWrap: {
        width: 84, height: 84, borderRadius: 26,
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    title: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 20 },
    errorBox: {
        width: '100%', backgroundColor: 'rgba(248,113,113,0.06)',
        borderWidth: 1, borderColor: 'rgba(248,113,113,0.15)',
        borderRadius: 12, padding: 12,
    },
    errorText: { fontSize: 11, color: '#F87171', fontFamily: 'monospace' },
    btn: {
        marginTop: 8, backgroundColor: Colors.primary,
        borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
    },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});