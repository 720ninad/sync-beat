import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { getToken } from './storage';

ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerPushToken(): Promise<void> {
    // Push only works on real devices (not web/simulator)
    if (Platform.OS === 'web') return;

    try {
        const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await ExpoNotifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('⚠️ Push notification permission denied');
            return;
        }

        const tokenData = await ExpoNotifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;
        console.log('📲 Expo push token:', pushToken);

        const authToken = await getToken();
        if (!authToken) return;

        await api.post(
            '/notifications/register',
            { pushToken },
            { headers: { Authorization: `Bearer ${authToken}` } },
        );
        console.log('✅ Push token registered');
    } catch (err) {
        console.error('registerPushToken error:', err);
    }
}

export function setupNotificationListeners(
    onIncomingCall: (data: { callId: string; callerId: string; callerName: string }) => void,
) {
    // Foreground notification tap
    const sub = ExpoNotifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data as any;
        if (data?.type === 'incoming_call') {
            onIncomingCall({
                callId: data.callId,
                callerId: data.callerId,
                callerName: data.callerName,
            });
        }
    });

    return () => sub.remove();
}