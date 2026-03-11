import { api } from './api';
import { getToken } from './storage';

const authHeader = async () => {
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
};

export async function searchUsers(query: string) {
    const res = await api.get(`/friends/search?query=${query}`, {
        headers: await authHeader(),
    });
    return res.data;
}

export async function sendFriendRequest(username: string) {
    const res = await api.post('/friends/request', { username }, {
        headers: await authHeader(),
    });
    return res.data;
}

export async function getFriendRequests() {
    const res = await api.get('/friends/requests', {
        headers: await authHeader(),
    });
    return res.data;
}

export async function acceptFriendRequest(id: string) {
    const res = await api.put(`/friends/request/${id}/accept`, {}, {
        headers: await authHeader(),
    });
    return res.data;
}

export async function declineFriendRequest(id: string) {
    const res = await api.put(`/friends/request/${id}/decline`, {}, {
        headers: await authHeader(),
    });
    return res.data;
}

export async function getFriends() {
    const res = await api.get('/friends', {
        headers: await authHeader(),
    });
    return res.data;
}

export async function removeFriend(id: string) {
    const res = await api.delete(`/friends/${id}`, {
        headers: await authHeader(),
    });
    return res.data;
}

export async function pingPresence() {
    const res = await api.post('/friends/ping', {}, {
        headers: await authHeader(),
    });
    return res.data;
}