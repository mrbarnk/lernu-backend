## lernu.io forum backend

TypeScript + Express + MongoDB API for posts, comments, reactions, notifications, uploads, and auth.

### Setup
- Install Node 18+ and MongoDB.
- Copy `.env.example` to `.env` and adjust values (Mongo URI, JWT secret, client origin, upload dir, R2 credentials/bucket/public base).
- Configure the optional `SMTP_*` variables to enable outbound email alerts for comment/reply notifications.
- Install deps: `npm install`.
- Seed default categories: `npm run seed`.
- Start dev server: `npm run dev` (listens on `PORT`, default 4000).

### Scripts
- `npm run dev` – start with hot reload.
- `npm run build` / `npm start` – compile and run from `dist/`.
- `npm run lint` – lint TypeScript sources.
- `npm run seed` – seed base categories.

### API surface (high level)
- Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`.
- Categories: `GET /categories`.
- Posts: `GET /posts?categoryId=&search=&cursor=&limit=`, `GET /posts/trending?window=24h&limit=3`, `GET /posts/:id`, `POST /posts`, `PATCH /posts/:id`, `DELETE /posts/:id`, `POST/DELETE /posts/:id/like`, `POST/DELETE /posts/:id/bookmark`, `POST /posts/:id/share`, `POST /posts/:id/report`.
- Reels: `GET /reels?cursor=&limit=&search=`, `GET /reels/:id`, `POST /reels`, `PATCH /reels/:id`, `DELETE /reels/:id`, `POST/DELETE /reels/:id/like`, `POST/DELETE /reels/:id/bookmark`, `POST /reels/:id/view`.
- Comments: `GET /posts/:id/comments?cursor=&limit=`, `GET /reels/:id/comments?cursor=&limit=`, `POST /comments` or `POST /reels/:id/comments`, `PATCH /comments/:id`, `DELETE /comments/:id`, `POST/DELETE /comments/:id/like`, `POST /comments/:id/accept`, `POST /comments/:id/report`.
- Notifications: `GET /notifications?cursor=&limit=&unreadOnly=true`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- Profiles: `GET /users/:id`, `GET /users/:id/posts?cursor=&limit=`, `PATCH /users/:id`.
- Stats: `GET /stats/community`.
- Uploads: `POST /uploads/images` (multipart `images[]`, up to 4 files) -> `{ urls: [] }` served from `/uploads/*`.

### Notes
- Cursor pagination uses `createdAt` ISO strings; responses include `nextCursor` when more pages remain.
- Post/comment responses include user-specific flags (`isLiked`, `isBookmarked`) when an auth token is provided.
- Moderation fields (`isPinned`, `isSolved`, comment acceptance) require `moderator` or `admin` roles.
- Notifications are stored for likes, comments, and @mentions (`@username`), with mark-read endpoints; integrate SSE/WebSocket as needed.
- Notification payloads include the triggering `actor` plus `post`/`comment` objects when relevant so the client can deep-link to the content; follow events surface the follower as `actor`.
- Uploads are stored locally by default; switch to S3/R2 via `UPLOAD_DRIVER` config.
- Reel responses include `views`, `totalWatchSeconds`, and `averageWatchSeconds`; increment with `POST /reels/:id/view` (auth optional) when playback starts/ends, passing `watchedSeconds` to capture watch time.
- Email alerts are sent for post/reel comment notifications (including replies) when SMTP settings are configured.
- Each view call logs who watched (if authenticated), when it was watched, and how many seconds were viewed so you can build per-user counts and average watch time later.
- Suggested reel engagement score for a trending rail: `(views * 0.25) + (likes * 3) + (comments * 4) + (shares * 5)`, optionally time-decayed (e.g., halve weight every 24h) to favor recent activity.
