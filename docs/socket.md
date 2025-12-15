# Realtime presence (Socket.IO)

The backend exposes a Socket.IO server for presence updates (who is online). Connect from the frontend to display the online users list or show live presence badges.

## Connection
- URL: same host as the API, Socket.IO default path (`/socket.io`).
- Auth: pass the JWT access token in the Socket.IO auth payload or as a `token` query string.
  - Auth payload example (recommended): `io(url, { auth: { token: "Bearer <accessToken>" } })`
  - Query fallback: `io(url, { query: { token: "Bearer <accessToken>" } })`
- The server will reject connections without a valid token (`connect_error` with message `"Unauthorized"`).

## Events the server emits
- `online-users` — sent on every connection and disconnect.
  - Payload: `OnlineUser[]` where each item is `{ id: string, username: string, displayName: string, avatar?: string }`.
  - Use this list to render online users; the full list is broadcast whenever someone comes online or goes offline.

## Events the client should handle
- `connect` — once connected, expect an immediate `online-users` event.
- `online-users` — update your online roster.
- `connect_error` — handle auth failures (e.g., bad/missing token) by prompting re-login or retrying after refreshing the token.

## Emitters (client -> server)
- None required for presence. Simply connecting with a valid token marks the user online; disconnecting marks them offline.

## Do we emit when a new user gets online?
- The server does not emit a per-user delta event; instead, it rebroadcasts the full `online-users` array on every join/leave. Listen to `online-users` to keep your UI in sync.
