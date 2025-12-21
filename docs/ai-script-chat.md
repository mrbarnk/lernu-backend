# AI Script Chat API integration

This documents the backend endpoints the `AI Script Writer` chat (`/ai-script`) expects. The UI supports: (1) generating a script from a topic, (2) getting a random script (category + format), (3) converting any script into scene-by-scene prompts in a chosen style, and (4) editing/previewing/exporting the assembled video.

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
  "model": "gpt-5.2-mini",                      // optional; AI model ID (see list below)
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
- "Write a script from my topic" sends `prompt` and expects `script`.
- "Get a random script" sends `topicCategory` + `format` (UI option IDs) and expects `script` plus resolved `topic`/`format` labels to title the chat.
- If `topicCategory` is provided (random script), you can ignore `model` and use the default route. When users provide their own topic/script, forward `model` (e.g., `gpt-5.2-mini` or `bible-knowledge`); Bible topics can use the Bible instruction set to enrich the script.
- `duration` is one of the predefined buckets: `15-30`, `30-40`, `40-60`, `60-90` (seconds).
- Credits: the UI prices generation by model (1-3 credits). Enforce credit checks server-side and return 429 `{ "message": "no AI credits" }` when the user cannot afford the chosen model.
- Keep scripts under ~1,200 words; separate paragraphs with blank lines for best rendering.

#### AI models (frontend IDs)
- `gpt-5.2-mini` (1 credit, default generalist)
- `gpt-4o-mini` (1 credit, cost-effective general)
- `bible-knowledge` (2 credits, tuned for Bible stories)
- `horror-master` (2 credits, tuned for scary/true-crime)
- `gpt-5-pro` (3 credits, premium/creative)
If `model` is omitted, treat it as `gpt-5.2-mini`. Backend can map these IDs to providers/models and deduct credits accordingly.

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
      "narration": "Narration text (voice-over); defaults to audioCaption when omitted",
      "captionText": "Optional on-screen caption text (can differ from narration)",
      "videoPrompt": "Prompt for motion/b-roll generation",
      "imagePrompt": "Prompt for keyframe/thumbnail generation",
      "duration": 8,
      "timingPlan": { "beats": [ { "label": "intro", "duration": 2.5 } ], "total": 8 }
    }
  ]
}
```

**Notes:**
- Scene array order matters (`sceneNumber` ascending). The UI shows up to ~8 scenes.
- `duration` (seconds) is displayed in the UI; include it per scene so users see timing.
- Each scene should include narration (for TTS), caption text, and a rough timing plan for highlights; `audioCaption` remains the legacy field and is used as a fallback.
- Prompts should incorporate `style.id` (e.g., `4k-realistic`, `anime`, `cinematic`, `pixar3d`) for style-aware text.
- The frontend currently maps backend fields to UI cards like this: `description -> audioCaption`, `bRollPrompt -> videoPrompt`, `imagePrompt -> imagePrompt`, `duration -> duration`. Returning those fields keeps both project and chat flows aligned.
- Keep `audioCaption` under ~220 characters for readability.

### Optional: regenerate scenes
Expose `POST /api/projects/:projectId/scenes/:sceneId/regenerate` (already stubbed in `projectApi`) to redo a specific scene with the same style and context. Not currently wired in the UI but available for future use.

### Video preview/export (new UI step)
After scenes are generated, users edit scenes, pick narration voice, background music, caption font, and font vertical position, then preview and export.
- **Start export:** reuse the existing client stub
```
POST /api/ai/video-from-script
```
**Request body (proposed):**
```json
{
  "script": "original or edited script text",
  "scenes": [
    { "sceneNumber": 1, "audioCaption": "...", "videoPrompt": "...", "imagePrompt": "...", "duration": 7 }
  ],
  "style": "cinematic",                // optional; align with scene gen style
  "voiceId": "narrator-deep",          // from VOICE_OPTIONS below
  "musicTrackId": "christmas-bells",   // from MUSIC_LIBRARY; "none" disables music
  "font": { "id": "impact", "position": 75 }, // caption font + % from top
  "quality": "sd",                     // "sd" | "hd"; HD unlock happens client-side via rewarded ad
  "model": "gpt-5.2-mini"              // optional; align with script generator if needed
}
```
**Response (200):**
```json
{ "id": "job-id", "status": "processing", "provider": "veo", "operationName": "op-123", "videoUri": null, "progress": 5 }
```
- **Poll status:**
```
GET /api/ai/videos/:id/status
```
Return `{ status: "processing"|"completed"|"failed", videoUri?, progress?, operationName?, message?, quality? }`. When `status` is `completed`, the UI surfaces `videoUri` for download/share. If HD vs SD differs, include `quality` in responses.

### Scene audio + media + captions
- Per-scene voice: send each scene's narration to ElevenLabs with the chosen `voiceId`; keep one audio file per scene (e.g., `scene_01.wav`) and optionally store word/character timestamps for caption highlights.
- Per-scene media: user uploads/chooses an image or video for each scene. Images get a randomized subtle pan/zoom so they feel like video; video clips are trimmed to the scene duration (scene audio length drives the trim). Save per-scene media so users can resume editing later. If scenes are added/reordered, only regenerate affected media/audio.
- Captions/highlight/positioning: user picks font/size/color/stroke/shadow and vertical position (bottom/top/center or x/y drag). Use timestamps to highlight the active word during playback.
- FFmpeg preview: compose media + narration audio + optional ducked music + caption overlay (with highlights) into a quick low-res preview (e.g., 720p).
- FFmpeg final: re-render at the requested resolution/aspect (480p/720p/1080p; 9:16, 1:1, or 16:9) with final bitrate/audio mix, outputting MP4 (H.264/AAC) or WebM. Save to the user's library and expose `videoUri` for download.

### Voice and background music catalogs (frontend IDs)
- Voices (`voiceId`): `narrator-deep`, `narrator-warm`, `storyteller-f`, `storyteller-m`, `dramatic-f`, `mysterious`, `upbeat-f`, `classic-m`.
- Music (`musicTrackId`): `none`, `christmas-bells`, `winter-wonder`, `choristes`, `fur-elise`, `villain`, `strings`, `movie-trailer`, `ghost`, `dark-synths`, `spooky`, `phonk`, `comedy`, `eternal-strings`.
The frontend only sends IDs; backend can map them to asset URLs.

## Conversation persistence + auth (replace localStorage)
- Today the UI stores chats in `localStorage` under `ai_script_conversations` and `ai_script_active_conversation` using the shape in `useScriptConversations.ts`. To sync across devices and lock the feature behind auth, add the endpoints below and require `Authorization: Bearer <accessToken>` on all of them.
- Data model the UI expects:
  - Conversation: `{ id, title, flowStep, generatedScript, selectedTopic, selectedTopicId, selectedFormat, selectedFormatId, selectedStyle, selectedDuration, createdAt, updatedAt }`
  - Message: `{ id, role: "assistant" | "user", content, options?, scenes? }` where `scenes` matches `SceneSequence` (`sceneNumber, audioCaption, videoPrompt, imagePrompt, duration?`).
- Endpoints (all auth-required; 401/403 on unauthenticated/unauthorized):
  - `GET /api/ai/conversations` — list conversations for the user, ordered by `updatedAt desc`. Return lightweight items: `{ id, title, updatedAt, lastMessageSnippet? }`.
  - `POST /api/ai/conversations` — create a new conversation. Accept optional `{ title }`, return full conversation with empty `messages` or the default assistant greeting.
  - `GET /api/ai/conversations/:id` — full conversation with `messages` and metadata fields above. Enforce ownership.
  - `PATCH /api/ai/conversations/:id` — rename and/or update metadata fields (`title`, `flowStep`, `generatedScript`, selected topic/format/style/duration). Return updated conversation.
  - `DELETE /api/ai/conversations/:id` — delete a conversation for the current user.
  - `POST /api/ai/conversations/:id/messages` — append a message (the UI sends `{ role, content, options?, scenes? }`). Return the appended message or the updated conversation. The AI generation endpoints can also auto-append assistant messages if you prefer.
- Additional metadata to persist for the new editor/preview steps (optional but recommended so users can resume): `voiceId`, `musicTrackId`, `fontId`, `fontPosition`, and `model`. Add nullable columns or a JSON blob; the UI can sync them once available.
- Persist per-scene media (image/video selection and any trims) so users can save progress and continue editing later.
- Suggested storage (example schema; adapt to your DB):
  - `ai_conversations`: `id (uuid)`, `user_id`, `title`, `flow_step`, `generated_script`, `selected_topic`, `selected_topic_id`, `selected_format`, `selected_format_id`, `selected_style`, `selected_duration`, `created_at`, `updated_at`.
  - `ai_conversation_messages`: `id (uuid)`, `conversation_id`, `role`, `content (text)`, `options (jsonb)`, `scenes (jsonb)`, `created_at`.
- Auth protect the page:
  - Keep `/ai-script` behind auth by requiring a valid access token on the above endpoints and returning 401. The frontend already hydrates auth via `/auth/me` and stores tokens under `lernu_access_token`/`lernu_refresh_token`; once the endpoints return 401 the UI can redirect to `/auth` or show a sign-in prompt.
  - Optionally add a lightweight guard endpoint (e.g., `HEAD /auth/me` or reuse `GET /auth/me`) to confirm session before rendering the page.
- Style options remain frontend-defined (`STYLE_OPTIONS`); backend only needs to accept and echo `style.id` when saving metadata or generating scenes.

## Validation and limits
- Reject empty `prompt`/`script` with `400` and a clear `message`.
- Cap `sceneCount` to a reasonable max (e.g., 12) to keep responses fast.
- Trim or sanitize excessively long scripts to avoid overwhelming the UI.

## Example flows
1) **Write a script from topic** — `POST /api/ai/script` with `prompt`/`model`/`duration` -> show `script` -> user clicks "Generate Scenes" -> `POST /api/projects/generate-scenes` with `script` + `style` -> edit scenes -> pick voice/music/font -> `POST /api/ai/video-from-script`.
2) **Get a random script** — `POST /api/ai/script` with `topicCategory` + `format` -> show `script` -> same scene + editor + export flow.
3) **Convert my script to scenes** — user pastes script -> `POST /api/projects/generate-scenes` with pasted `script` + `style` -> edit scenes -> pick voice/music/font -> export.
