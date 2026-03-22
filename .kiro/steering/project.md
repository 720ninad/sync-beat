# SyncBeat — Project Steering

## What This App Is
SyncBeat is a real-time synchronized music listening app. Two friends call each other, one picks a song, and both hear it in perfect sync. Built with Expo (React Native) + Express + Socket.io.

---

## Stack

### Server (`/server`)
- Runtime: Node.js + TypeScript
- Framework: Express 5
- WebSockets: Socket.io 4
- Database: PostgreSQL via Drizzle ORM (hosted on Supabase)
- Cache / Presence: Upstash Redis (TLS — `rediss://` URL, uses `ioredis`)
- File Storage: Cloudflare R2 (S3-compatible, via `@aws-sdk/client-s3`)
- Auth: JWT (`jsonwebtoken`) + bcrypt
- Email: Resend
- Push Notifications: Expo Push (via `expo-server-sdk`)
- Audio extraction: `yt-dlp` (installed at build time via pip)
- Deployment: Render free tier (Oregon), keep-alive ping every 10 min

### Client (`/client`)
- Framework: Expo SDK 55 + React Native 0.83
- Router: expo-router (file-based, v3)
- Audio: expo-av
- Storage: expo-secure-store (tokens), AsyncStorage (call session)
- Sockets: socket.io-client
- State: local useState (no global store except zustand installed but unused)
- HTTP: axios (via `client/src/lib/api.ts`)
- Push: expo-notifications

---

## Project Structure

```
syncbeat/
├── client/
│   ├── app/
│   │   ├── _layout.tsx          # Root layout — socket init, call listeners, push setup
│   │   ├── index.tsx            # Redirect to /home or /login
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── forgot-password.tsx
│   │   ├── add-friend.tsx
│   │   ├── (main)/
│   │   │   ├── _layout.tsx      # Stack navigator (no header)
│   │   │   ├── home.tsx         # Friends list + presence + call button
│   │   │   ├── library.tsx      # My/Public/Liked/Search tabs + audio player
│   │   │   ├── profile.tsx
│   │   │   ├── edit-profile.tsx
│   │   │   ├── change-password.tsx
│   │   │   └── friend-requests.tsx
│   │   └── call/
│   │       ├── _layout.tsx
│   │       ├── outgoing.tsx     # Caller waiting screen
│   │       ├── incoming.tsx     # Receiver ring screen
│   │       ├── pick-song.tsx    # Both users pick a track
│   │       ├── player.tsx       # Synced playback screen
│   │       └── ended.tsx        # Post-call summary
│   └── src/
│       ├── lib/
│       │   ├── api.ts           # Axios instance pointing to SERVER_URL/api
│       │   ├── auth.ts          # login, signup, getMe HTTP calls
│       │   ├── friends.ts       # getFriends, sendRequest, etc.
│       │   ├── tracks.ts        # getMyTracks, getPublicTracks, uploadTrack, etc.
│       │   ├── musicSearch.ts   # searchExternalTracks, addExternalTrack
│       │   ├── audioPlayer.ts   # Singleton AudioPlayerService (expo-av)
│       │   ├── socket.ts        # connectSocket, getSocket, setOnReconnect
│       │   ├── call.ts          # initiateCall, acceptCall, registerCallListeners
│       │   ├── callSession.ts   # Persists call state across reloads (AsyncStorage)
│       │   ├── syncEngine.ts    # Sync logic for player screen
│       │   ├── storage.ts       # getToken, setToken, removeToken (SecureStore)
│       │   ├── notifications.ts # registerPushToken, setupNotificationListeners
│       │   ├── history.ts       # getListenHistory
│       │   └── toast.tsx        # toast.success / toast.error helpers
│       └── components/
│           ├── ErrorBoundary.tsx
│           └── Loader.tsx
│
└── server/
    └── src/
        ├── index.ts             # Express app, Socket.io setup, keep-alive
        ├── db/
        │   ├── index.ts         # Drizzle db instance
        │   └── schema.ts        # All table definitions
        ├── controllers/
        │   ├── auth.controller.ts
        │   ├── forgot-password.controller.ts
        │   ├── friends.controller.ts
        │   ├── tracks.controller.ts   # Upload, search, stream, like, delete
        │   ├── history.controller.ts
        │   └── notifications.controller.ts
        ├── routes/
        │   ├── auth.routes.ts
        │   ├── forgot-password.routes.ts
        │   ├── friends.routes.ts
        │   ├── tracks.routes.ts       # /stream/:videoId is PUBLIC (before authMiddleware)
        │   ├── history.routes.ts
        │   └── notifications.routes.ts
        ├── socket/
        │   ├── socket.handler.ts      # Registers all socket handlers
        │   └── call.handler.ts        # All call:* and sync:* socket events
        ├── middleware/
        │   ├── auth.ts                # JWT authMiddleware (sets req.user)
        │   └── rateLimit.ts           # Rate limiters (generalLimiter disabled in dev)
        └── lib/
            ├── redis.ts               # Upstash Redis (ioredis, TLS), setUserOnline/Offline
            ├── ytdlp.ts               # getAudioUrl(videoId), searchYouTube(query, limit)
            ├── r2.ts                  # uploadToR2, deleteFromR2, getSignedDownloadUrl
            ├── push.ts                # sendPushNotification (Expo push SDK)
            ├── email.ts               # Resend email (OTP)
            └── env.ts                 # Validates required env vars on startup
```

---

## Database Schema (Drizzle / PostgreSQL)

| Table | Key columns |
|---|---|
| `users` | id, name, username, email, passwordHash, pushToken, isOnline, lastSeenAt |
| `friendships` | id, senderId, receiverId, status (pending/accepted/declined/blocked) |
| `tracks` | id, uploaderId, title, artist, duration, fileUrl, mimeType, isPublic, externalId, externalSource, previewUrl, imageUrl, albumName |
| `liked_tracks` | id, userId, trackId |
| `call_sessions` | id, callerId, receiverId, status (ringing/active/ended/missed/declined), startedAt, endedAt, durationSecs |
| `sync_sessions` | id, callSessionId, trackId, hostId, isPlaying, positionSecs, scheduledAt |
| `listen_history` | id, userId, trackId, listenedWithId, callSessionId, durationSecs |
| `otp_codes` | id, email, code, used, expiresAt |

---

## Critical Patterns & Known Gotchas

### Casing mismatch — DB vs search results
- Drizzle returns camelCase: `externalId`, `externalSource`, `previewUrl`, `fileUrl`
- Search results from server return snake_case: `external_id`, `source`, `preview_url`
- `audioPlayer.ts` handles both: `const ytId = track.external_id || track.externalId`
- Always check both casings when working with track objects on the client

### Track types (mimeType field)
- `audio/mpeg` / `audio/wav` etc — uploaded file, stored in R2, `fileUrl` is set
- `external` — YouTube track saved to library, `fileUrl` is empty, `externalSource: 'youtube'`, `externalId` is YouTube video ID

### Audio playback priority (audioPlayer.ts)
1. `fileUrl` + mimeType !== 'external' → R2 direct URL
2. `preview_url` → direct URL (from search result)
3. `previewUrl` → direct URL (saved DB track)
4. `externalId/external_id` + source === 'youtube' → `${SERVER_URL}/api/tracks/stream/${id}`

### YouTube streaming pipeline
- Search: `yt-dlp "ytsearch10:query" --dump-json` → returns metadata, no audio download
- Search results cached in Redis 30 min (`ytsearch:{query}:{limit}`)
- Play: client hits `GET /api/tracks/stream/:videoId` (public route, no auth)
- Stream endpoint: calls `getAudioUrl(videoId)` → yt-dlp extracts direct URL → cached 1hr in Redis (`audio:{videoId}`) → server proxies stream with Range header support
- Range headers are forwarded upstream so seeking works without re-buffering

### Socket rooms
- Every user joins `user:{userId}` on connect
- Call participants join `call:{callId}` on initiate/accept
- Presence events: `friend:online`, `friend:offline` → emitted to `user:{friendId}`
- Call events: `call:incoming`, `call:accepted`, `call:declined`, `call:cancelled`, `call:ended`, `call:missed`
- Sync events: `sync:start`, `sync:pause`, `sync:resume`, `sync:seek`, `sync:state`, `sync:ping/pong`

### Socket reconnect handling
- `socket.ts` exposes `setOnReconnect(cb)` — called on every `connect` event
- `_layout.tsx` uses this to re-run `unregisterCallListeners` + `registerCallListeners` on every reconnect
- This is critical on mobile where sockets drop on background/foreground

### Call flow
1. A taps call → `initiateCall(receiverId)` → socket `call:initiate` → server creates `callSessions` row, emits `call:incoming` to B's room + sends push notification to B
2. B sees incoming screen → accepts → `call:accept` → server updates status to `active`, emits `call:accepted` to A
3. Both navigate to `pick-song` screen
4. One picks a track → `sync:start` emitted to `call:{callId}` room → both navigate to `player`
5. Either ends → `call:end` → server saves `listenHistory`, emits `call:ended` to both

### Auth
- JWT stored in SecureStore on client
- `authMiddleware` sets `req.user` from JWT payload
- Socket auth: token passed in `socket.handshake.auth.token`, verified in `io.use()` middleware
- On `Invalid token` socket error: token is cleared, user redirected to login

### Redis (Upstash)
- URL format: `rediss://` (TLS) — must use ioredis, not the `redis` package
- `setUserOnline(userId)` — sets key with TTL, marks `isOnline: true` in DB
- `setUserOffline(userId)` — deletes key, marks `isOnline: false` in DB
- Presence ping: client emits `presence:ping` every 25s to keep Redis TTL alive

### Rate limiting
- `generalLimiter` is commented out in `index.ts` (disabled for dev)
- `authLimiter`, `otpLimiter`, `uploadLimiter` exist in `middleware/rateLimit.ts`

### Deployment
- Server: Render free tier, `render.yaml` defines build/start commands
- Build: `pip install yt-dlp && apt-get install -y ffmpeg || true && npm install && npm run build`
- Env vars: loaded from `syncbeat-secrets` group in Render dashboard
- Client API URL: `https://sync-beat-18qf.onrender.com/api` (set in `client/app.json` extra.apiUrl)
- Push notifications only work in `eas build` builds, not Expo Go

---

## Environment Variables (server)
| Var | Purpose |
|---|---|
| `JWT_SECRET` | JWT signing |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis (rediss:// TLS) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET_NAME` | `syncbeat-tracks` |
| `R2_PUBLIC_URL` | Public R2 CDN URL |
| `RESEND_API_KEY` | Email sending |
| `FROM_EMAIL` | Sender email address |
| `RENDER_EXTERNAL_URL` | Auto-set by Render, used for keep-alive ping |
