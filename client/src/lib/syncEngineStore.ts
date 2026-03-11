import { SyncEngine } from './syncEngine';

// Global singleton so pick-song and player share the same engine instance
let _engine: SyncEngine | null = null;

export function setSyncEngine(engine: SyncEngine) {
    _engine = engine;
}

export function getSyncEngine(): SyncEngine | null {
    return _engine;
}

export function clearSyncEngine() {
    _engine = null;
}