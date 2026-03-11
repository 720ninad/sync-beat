const KEY = 'syncbeat_active_call';

export interface ActiveCallSession {
    callId: string;
    targetId: string;
    name: string;
    isCaller: string;
    trackUrl?: string;
    trackTitle?: string;
    trackEmoji?: string;
    pickerUserId?: string;
    screen: 'pick-song' | 'player';
}

export function saveCallSession(session: ActiveCallSession) {
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch { }
}

export function getCallSession(): ActiveCallSession | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function clearCallSession() {
    try { sessionStorage.removeItem(KEY); } catch { }
}