import { api } from './api';
import { getToken } from './storage';

const authHeader = async () => {
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
};

export async function getHistory() {
    const res = await api.get('/history', { headers: await authHeader() });
    return res.data;
}

export async function getStats() {
    const res = await api.get('/history/stats', { headers: await authHeader() });
    return res.data;
}