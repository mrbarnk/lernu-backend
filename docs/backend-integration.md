# Backend integration requirements

This frontend is a forum-style feed with posts, comments, reactions, notifications, and user auth currently mocked in `src/data/forumData.ts` and `AuthContext`. Below is what the backend must provide to replace the mocks.

## Core entities
- User: `id`, `email`, `username`, `displayName`, `avatar`, `bio`, `joinedAt`, `level`, `isOnline`.
- Category: `id`, `name`, `icon`, `color`.
- Post: `id`, `author`, `categoryId`, optional `title`, `content`, optional `code { language, snippet }`, optional `images[]` (URLs), `createdAt`, counts (`likes`, `comments`, `shares`), flags (`isLiked`, `isBookmarked`, `isPinned`, `isSolved`, `isEdited`), `tags[]`.
- Comment: `id`, `postId`, `author`, `content`, optional `code`, optional `images[]`, `createdAt`, `likes`, flags (`isLiked`, `isAccepted`, `isEdited`).
- Notification: `id`, `type` (`like` | `comment` | `mention`), `actor`, `postId`, optional `postTitle`, `createdAt`, `isRead`.

## Auth
- `POST /auth/login` (email, password) -> `user`, tokens.
- `POST /auth/signup` (email, password, username, displayName) -> `user`, tokens.
- `GET /auth/me` -> current user.
- `POST /auth/logout`.

## Taxonomy
- `GET /categories` -> list of category ids/names/icons/colors.

## Feed and search
- `GET /posts?categoryId=&search=&cursor=&limit=` returns paginated posts sorted by recency (frontend uses infinite scroll). Include user-specific flags `isLiked` and `isBookmarked`.
- `GET /posts/trending?window=24h&limit=3` (or include `engagementScore` fields) to support “Trending Now” (frontend ranks likes + comments*2).
- Support search over title, content, and tags.
- `GET /posts/:id` -> single post with all fields.

## Post authoring
- `POST /posts` with `{ title?, content, categoryId, code?, images?, tags[] }` -> created post.
- `PATCH /posts/:id` with same fields + flags `isPinned`, `isSolved` (moderator/staff only).
- `DELETE /posts/:id`.
- Image upload endpoint (e.g., `POST /uploads/images`) returning URL for up to 4 images per post.
- Respect tag max (5) and image max (4) like the UI.

## Reactions and saves
- `POST /posts/:id/like` and `DELETE /posts/:id/like`.
- `POST /posts/:id/bookmark` and `DELETE /posts/:id/bookmark`.
- Optional: `POST /posts/:id/share` to increment share count.

## Comments
- `GET /posts/:id/comments?cursor=&limit=` -> paginated comments.
- `POST /comments` `{ postId, content, code?, images? }`.
- `PATCH /comments/:id` / `DELETE /comments/:id`.
- `POST /comments/:id/like` and `DELETE /comments/:id/like`.
- Optional: `POST /comments/:id/accept` to mark an accepted/solved reply.

## Notifications
- `GET /notifications?cursor=&limit=&unreadOnly=` -> paginated list with `isRead`.
- `POST /notifications/:id/read` and `POST /notifications/read-all`.
- Server should emit notifications for likes, comments, mentions; SSE/WebSocket recommended for real-time.

## Sidebar/metrics
- Endpoint(s) for summary stats used in the sidebar: active learners online, posts today, questions solved (e.g., `GET /stats/community`).
- Optional: presence channel to supply `isOnline` for active users list.

## Profiles
- `GET /users/:id` -> profile data and recent posts.
- `GET /users/:id/posts?cursor=&limit=`.
- `PATCH /users/:id` for updating bio/avatar (if supported).

## Moderation/reporting (hook available in UI)
- `POST /posts/:id/report` and `POST /comments/:id/report` to handle “Report” menu action.

## Frontend expectations and notes
- Pagination: cursor-based preferred; frontend currently slices arrays but should map to `cursor`/`limit`.
- Time fields: `createdAt` should be ISO strings; frontend displays relative times.
- Images: UI currently reads base64; real API should return HTTPS URLs.
- Keep shapes close to `Post`/`Comment`/`Notification` interfaces to minimize refactors.
- Authentication state drives UI (create/edit/delete, notification bell). Ensure 401 flows are handled.
