# AI Script Generator Guide

This guide explains how to use the AI Script Writer API end-to-end: generating scripts, converting them into scenes, persisting conversations, and understanding credits and limits.

## Prerequisites
- Auth: Bearer access token in `Authorization: Bearer <accessToken>`.
- Credits: Each script generation consumes **1 AI credit**. Check balance via `/users/me/credits` or `/auth/me` (field `aiCredits`). When out of credits the API returns `429` with a friendly message.
- Content length: Keep prompts under ~4,000 chars; scripts under ~5,000 chars for downstream scene splitting.

## 1) Generate a script
`POST /api/ai/script`

Request body:
```json
{
  "prompt": "How whales evolved echolocation",
  "language": "en",
  "duration": "40-60",
  "topicCategory": "scary-stories",
  "format": "storytelling"
}
```
- Provide either `prompt` **or** both `topicCategory` and `format` to let the backend pick a random topic/format.
- `duration` guides pacing (e.g., `15-30`, `30-40`, `40-60`, `60-90` seconds).

Response:
```json
{
  "script": "Opening line...\n\nBody paragraphs...\n\nClosing hook...",
  "topic": "The Watcher in the Woods",
  "format": "Storytelling",
  "usage": { "promptTokens": 123, "completionTokens": 456, "totalTokens": 579, "model": "gpt-4o-mini" },
  "creditsRemaining": 19
}
```
- `creditsRemaining` reflects the balance after consumption.
- Errors: `401` if unauthenticated, `429` if out of credits.

## 2) Convert a script into scenes
`POST /api/projects/generate-scenes` (auth required)

Request body:
```json
{
  "script": "Full script text...",
  "topic": "Optional title/context",
  "sceneCount": 8,
  "style": { "id": "cinematic", "label": "Cinematic" },
  "refine": false
}
```

Response (trimmed):
```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "audioCaption": "Narration/caption...",
      "videoPrompt": "Motion/b-roll prompt...",
      "imagePrompt": "Thumbnail/keyframe prompt...",
      "duration": 8
    }
  ]
}
```

## 3) Persist conversations (optional)
All endpoints require auth.
- `GET /api/ai/conversations` — list conversations (`{ id, title, updatedAt, lastMessageSnippet }`).
- `POST /api/ai/conversations` — create (optional `{ title }`).
- `GET /api/ai/conversations/:id` — fetch full conversation + messages.
- `PATCH /api/ai/conversations/:id` — update metadata (`title`, `flowStep`, `generatedScript`, selected topic/format/style/duration).
- `DELETE /api/ai/conversations/:id` — delete.
- `POST /api/ai/conversations/:id/messages` — append `{ role: "assistant"|"user", content, options?, scenes? }`.

## Credits and rewards
- Spend: `/api/ai/script` consumes 1 credit.
- Earn: A quality post or comment (≥120 chars) grants **4 credits once per UTC day**. Post/comment create responses include `creditsAwarded` and updated `aiCredits` when awarded.
- Balance: `aiCredits` returned on `/auth/me` and `/users/me/credits`.
- Out-of-credits: API responds with `429` and message `"You have no AI credits left. Please top up to generate more scripts."`

## Error handling & limits
- 400: validation (missing prompt, invalid IDs, etc.).
- 401/403: auth/authorization failures.
- 429: no credits.
- Length limits: prompts ≤ 4,000 chars, scripts ≤ 5,000 chars; scene counts capped (backend default 6–8 if unspecified).

## Quick cURL examples
Generate script:
```bash
curl -X POST https://api.yourhost.com/api/ai/script \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"How whales evolved echolocation","duration":"40-60"}'
```

Generate scenes:
```bash
curl -X POST https://api.yourhost.com/api/projects/generate-scenes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"script":"Full script text","sceneCount":6,"style":{"id":"cinematic"}}'
```

## Use cases (usefulness)
- **Idea to script fast**: Turn a topic or random category into a faceless short-form script with pacing hints.
- **Script to storyboard**: Split narration into scene-by-scene prompts for thumbnails/b-roll.
- **Device sync**: Persist chats so users can continue on any device.
- **Engagement incentives**: Earn credits by posting quality content; spend them on AI generation.
