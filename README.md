## lernu.io forum backend

TypeScript + Express + MongoDB API for posts, comments, reactions, notifications, uploads, and auth.

### Setup
- Install Node 18+ and MongoDB.
- Copy `.env.example` to `.env` and adjust values (Mongo URI, JWT secret, client origin, upload dir, R2 credentials/bucket/public base).
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
- Comments: `GET /posts/:id/comments?cursor=&limit=`, `POST /comments`, `PATCH /comments/:id`, `DELETE /comments/:id`, `POST/DELETE /comments/:id/like`, `POST /comments/:id/accept`, `POST /comments/:id/report`.
- Notifications: `GET /notifications?cursor=&limit=&unreadOnly=true`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- Profiles: `GET /users/:id`, `GET /users/:id/posts?cursor=&limit=`, `PATCH /users/:id`.
- Stats: `GET /stats/community`.
- Uploads: `POST /uploads/images` (multipart `images[]`, up to 4 files) -> `{ urls: [] }` served from `/uploads/*`.

### Notes
- Cursor pagination uses `createdAt` ISO strings; responses include `nextCursor` when more pages remain.
- Post/comment responses include user-specific flags (`isLiked`, `isBookmarked`) when an auth token is provided.
- Moderation fields (`isPinned`, `isSolved`, comment acceptance) require `moderator` or `admin` roles.
- Notifications are stored for likes, comments, and @mentions (`@username`), with mark-read endpoints; integrate SSE/WebSocket as needed.
