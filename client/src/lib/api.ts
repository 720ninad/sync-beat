import axios from 'axios';
import Constants from 'expo-constants';

const BASE_URL =
    Constants.expoConfig?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    'http://localhost:3000/api';

export const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
});

// Auto attach token to every request
api.interceptors.request.use((config) => {
    const token = global.localStorage?.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});