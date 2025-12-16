# AI Script Chat API integration

This documents the backend endpoints the `AI Script Writer` chat (`/ai-script`) expects. The UI supports: (1) generating a script from a topic, (2) getting a random script (category + format), and (3) converting any script into scene-by-scene prompts in a chosen style.

## Conventions
- Base URL: `VITE_API_BASE_URL`; all paths below are relative.
- Auth: Bearer token (`Authorization: Bearer <accessToken>`) for authenticated endpoints. Script generation can be open if you prefer.
- Errors: return `{ "message": string }` on non-2xx for user-friendly toasts.

## Endpoints

### Generate a script
```
POST /api/ai/script
```
**Auth:** optional  
**Purpose:** Generate a full video script from a topic or let the backend pick a random topic/format.

**Request body:**
```json
{
  "prompt": "How whales evolved echolocation",  // required if no category/format
  "language": "en",                             // optional; default "en"
  "duration": "40-60",                          // required option for runtime bucket
  "topicCategory": "scary-stories",             // optional; used for "Get a random script"
  "format": "storytelling"                      // optional; pairs with topicCategory
}
```

**Response (200):**
```json
{
  "script": "Opening line...\n\nBody paragraphs...\n\nClosing hook...",
  "topic": "The Watcher in the Woods",   // optional, returned when random topic chosen
  "format": "Storytelling"               // optional, echoes the picked format
}
```

**Notes:**
- “Write a script from my topic” sends `prompt` and expects `script`.
- “Get a random script” sends `topicCategory` + `format` (UI option IDs) and expects `script` plus resolved `topic`/`format` labels to title the chat.
- `duration` is one of the predefined buckets: `15-30`, `30-40`, `40-60`, `60-90` (seconds).
- Keep scripts under ~1,200 words; separate paragraphs with blank lines for best rendering.

### Convert a script into scenes with prompts
```
POST /api/projects/generate-scenes
```
**Auth:** required  
**Purpose:** Break a script into scene sequences with narration, video/image prompts, and per-scene durations, respecting the selected style.

**Request body:**
```json
{
  "script": "Full script text to split into scenes", // required
  "topic": "Optional topic/title for context",       // optional
  "sceneCount": 8,                                   // optional; default 6-8
  "style": {
    "id": "cinematic",                               // matches frontend style IDs
    "label": "Cinematic"                             // optional display label
  },
  "refine": false                                    // optional: allow lighter/faster generation
}
```

**Response (200):**
```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "audioCaption": "Narration/caption for the first beat...",
      "videoPrompt": "Prompt for motion/b-roll generation",
      "imagePrompt": "Prompt for keyframe/thumbnail generation",
      "duration": 8
    }
  ]
}
```

**Notes:**
- Scene array order matters (`sceneNumber` ascending). The UI shows up to ~8 scenes.
- `duration` (seconds) is displayed in the UI; include it per scene so users see timing.
- Prompts should incorporate `style.id` (e.g., `4k-realistic`, `anime`, `cinematic`, `pixar3d`) for style-aware text.
- Keep `audioCaption` under ~220 characters for readability.

### Optional: regenerate scenes
Expose `POST /api/projects/:projectId/scenes/:sceneId/regenerate` (already stubbed in `projectApi`) to redo a specific scene with the same style and context. Not currently wired in the UI but available for future use.

## Conversation persistence + auth (replace localStorage)
- Today the UI stores chats in `localStorage` under `ai_script_conversations` and `ai_script_active_conversation` using the shape in `useScriptConversations.ts`. To sync across devices and lock the feature behind auth, add the endpoints below and require `Authorization: Bearer <accessToken>` on all of them.
- Data model the UI expects:
  - Conversation: `{ id, title, flowStep, generatedScript, selectedTopic, selectedTopicId, selectedFormat, selectedFormatId, selectedStyle, selectedDuration, createdAt, updatedAt }`
  - Message: `{ id, role: "assistant" | "user", content, options?, scenes? }` where `scenes` matches `SceneSequence` (`sceneNumber, audioCaption, videoPrompt, imagePrompt, duration?`).
- Endpoints (all auth-required; 401/403 on unauthenticated/unauthorized):
  - `GET /api/ai/conversations` → list conversations for the user, ordered by `updatedAt desc`. Return lightweight items: `{ id, title, updatedAt, lastMessageSnippet? }`.
  - `POST /api/ai/conversations` → create a new conversation. Accept optional `{ title }`, return full conversation with empty `messages` or the default assistant greeting.
  - `GET /api/ai/conversations/:id` → full conversation with `messages` and metadata fields above. Enforce ownership.
  - `PATCH /api/ai/conversations/:id` → rename and/or update metadata fields (`title`, `flowStep`, `generatedScript`, selected topic/format/style/duration). Return updated conversation.
  - `DELETE /api/ai/conversations/:id` → delete a conversation for the current user.
  - `POST /api/ai/conversations/:id/messages` → append a message (the UI sends `{ role, content, options?, scenes? }`). Return the appended message or the updated conversation. The AI generation endpoints can also auto-append assistant messages if you prefer.
- Suggested storage (example schema; adapt to your DB):
  - `ai_conversations`: `id (uuid)`, `user_id`, `title`, `flow_step`, `generated_script`, `selected_topic`, `selected_topic_id`, `selected_format`, `selected_format_id`, `selected_style`, `selected_duration`, `created_at`, `updated_at`.
  - `ai_conversation_messages`: `id (uuid)`, `conversation_id`, `role`, `content (text)`, `options (jsonb)`, `scenes (jsonb)`, `created_at`.
- Auth protect the page:
  - Keep `/ai-script` behind auth by requiring a valid access token on the above endpoints and returning 401. The frontend already hydrates auth via `/auth/me` and stores tokens under `lernu_access_token`/`lernu_refresh_token`; once the endpoints return 401 the UI can redirect to `/auth` or show a sign-in prompt.
  - Optionally add a lightweight guard endpoint (e.g., `HEAD /auth/me` or reuse `GET /auth/me`) to confirm session before rendering the page.
- Style options remain frontend-defined (`STYLE_OPTIONS`); backend only needs to accept and echo `style.id` when saving metadata or generating scenes.

## Credit system
- Script generation requires auth and consumes **1 AI credit** per call.
- Daily contributions earn credits: a quality post/comment (>=120 characters) grants **4 credits** once per UTC day.
- Balances:
  - Returned on `/auth/me` as `aiCredits`.
  - Dedicated endpoint: `GET /users/me/credits` (auth required) returns `{ aiCredits }`.
- Errors: when out of credits, the API responds with `429` and `{"message": "You have no AI credits left. Please top up to generate more scripts."}`.

## Validation and limits
- Reject empty `prompt`/`script` with `400` and a clear `message`.
- Cap `sceneCount` to a reasonable max (e.g., 12) to keep responses fast.
- Trim or sanitize excessively long scripts to avoid overwhelming the UI.

## Example flows
1) **Write a script from topic** → `POST /api/ai/script` with `prompt` → show `script` → user clicks “Generate Scenes” → `POST /api/projects/generate-scenes` with `script` + `style`.
2) **Get a random script** → `POST /api/ai/script` with `topicCategory` + `format` → show `script` → same scene generation flow.
3) **Convert my script to scenes** → user pastes script → `POST /api/projects/generate-scenes` with pasted `script` + `style`.
