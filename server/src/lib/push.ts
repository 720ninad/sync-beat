import Expo, { ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
): Promise<void> {
    if (!Expo.isExpoPushToken(pushToken)) {
        console.warn(`⚠️ Invalid Expo push token: ${pushToken}`);
        return;
    }

    const message: ExpoPushMessage = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
    };

    try {
        const chunks = expo.chunkPushNotifications([message]);
        const receipts = await expo.sendPushNotificationsAsync(chunks[0]);
        console.log('📲 Push sent:', receipts);
    } catch (err) {
        console.error('Push notification error:', err);
    }
}