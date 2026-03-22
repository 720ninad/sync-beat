import { api } from './api';
import { disconnectSocket } from './socket';
import { saveToken, getToken, removeToken } from './storage';

export async function registerUser(data: {
    name: string;
    username: string;
    email: string;
    password: string;
}) {
    const res = await api.post('/auth/register', data);
    await saveToken(res.data.token);
    return res.data;
}

export async function loginUser(data: { email: string; password: string }) {
    const res = await api.post('/auth/login', data);
    await saveToken(res.data.token);
    // Socket will be connected by _layout.tsx when it re-renders on the home route
    return res.data;
}

export async function getMe() {
    const token = await getToken();
    if (!token) return null;
    const res = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
}

export async function logoutUser() {
    disconnectSocket(); // ← disconnect socket on logout
    await removeToken();
}

export async function updateProfile(data: {
    name: string;
    username: string;
    email: string;
    bio?: string;
}) {
    const token = await getToken();
    const res = await api.put('/auth/profile', data, {
        headers: { Authorization: `Bearer ${token}` },
    });
    // Save new token (username/name may have changed)
    if (res.data.token) {
        await saveToken(res.data.token);
    }
    return res.data;
}

export async function changeUserPassword(data: {
    currentPassword: string;
    newPassword: string;
}) {
    const token = await getToken();
    const res = await api.put('/auth/change-password', data, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
}

export async function sendForgotOtp(email: string) {
    const res = await api.post('/forgot-password/send-otp', { email });
    return res.data;
}

export async function verifyForgotOtp(email: string, code: string) {
    const res = await api.post('/forgot-password/verify-otp', { email, code });
    return res.data;
}

export async function resetForgotPassword(email: string, code: string, newPassword: string) {
    const res = await api.post('/forgot-password/reset-password', { email, code, newPassword });
    return res.data;
}