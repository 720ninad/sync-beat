import {
    pgTable, uuid, text, timestamp,
    unique, boolean, integer, real
} from 'drizzle-orm/pg-core';

// ─── USERS ───────────────────────────────────────────
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    bio: text('bio').default('').notNull(),
    avatarUrl: text('avatar_url'),

    // Push notifications
    pushToken: text('push_token'),

    // Presence
    isOnline: boolean('is_online').default(false).notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── FRIENDSHIPS ─────────────────────────────────────
// senderId sent the request to receiverId
export const friendships = pgTable('friendships', {
    id: uuid('id').defaultRandom().primaryKey(),
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(), // pending | accepted | declined | blocked
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    uniquePair: unique().on(t.senderId, t.receiverId),
}));

// ─── TRACKS ──────────────────────────────────────────
export const tracks = pgTable('tracks', {
    id: uuid('id').defaultRandom().primaryKey(),
    uploaderId: uuid('uploader_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    artist: text('artist').default('Unknown').notNull(),
    duration: integer('duration').notNull(),            // seconds
    fileUrl: text('file_url').notNull(),               // Cloudflare R2 URL or empty for external
    fileSize: integer('file_size').notNull(),           // bytes
    mimeType: text('mime_type').default('audio/mpeg').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    playCount: integer('play_count').default(0).notNull(),

    // External track fields
    externalId: text('external_id'),                    // ID from external service
    externalSource: text('external_source'),            // 'lastfm', 'musicbrainz', 'theaudiodb'
    albumName: text('album_name'),                      // Album name
    imageUrl: text('image_url'),                        // Album/track artwork URL
    previewUrl: text('preview_url'),                    // Preview/sample URL if available

    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── LIKED TRACKS ────────────────────────────────────
export const likedTracks = pgTable('liked_tracks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
    uniqueLike: unique().on(t.userId, t.trackId),
}));

// ─── CALL SESSIONS ───────────────────────────────────
export const callSessions = pgTable('call_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    callerId: uuid('caller_id').notNull().references(() => users.id),
    receiverId: uuid('receiver_id').notNull().references(() => users.id),
    status: text('status').default('ringing').notNull(),
    // ringing | active | ended | missed | declined
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    durationSecs: integer('duration_secs'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── SYNC SESSIONS ───────────────────────────────────
// Tracks what song is playing during a call
export const syncSessions = pgTable('sync_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    callSessionId: uuid('call_session_id').notNull().references(() => callSessions.id),
    trackId: uuid('track_id').notNull().references(() => tracks.id),
    hostId: uuid('host_id').notNull().references(() => users.id),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),

    // Sync state
    isPlaying: boolean('is_playing').default(true).notNull(),
    positionSecs: real('position_secs').default(0).notNull(),
    scheduledAt: timestamp('scheduled_at'),              // server time when track should start
});

// ─── LISTEN HISTORY ──────────────────────────────────
export const listenHistory = pgTable('listen_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').notNull().references(() => tracks.id),
    listenedWithId: uuid('listened_with_id').references(() => users.id),  // friend you listened with
    callSessionId: uuid('call_session_id').references(() => callSessions.id),
    durationSecs: integer('duration_secs').default(0).notNull(),          // how long they listened
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── OTP CODES ───────────────────────────────────────
export const otpCodes = pgTable('otp_codes', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    code: text('code').notNull(),
    used: boolean('used').default(false).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});