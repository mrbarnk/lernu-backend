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
  "duration": "60s",                            // optional runtime hint
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
- `duration` is a free-form hint (e.g., `"60s"` or `"40-60"`) to guide pacing.
- Keep scripts under ~1,200 words; separate paragraphs with blank lines for best rendering.

### Convert a script into scenes with prompts
```
POST /api/projects/generate-scenes
```
**Auth:** required  
**Purpose:** Break a script into scene sequences with narration, image prompts, b-roll prompts, and per-scene durations, respecting the selected style.

**Request body:**
```json
{
  "script": "Full script text to split into scenes", // required
  "topic": "Optional topic/title for context",       // optional
  "sceneCount": 8,                                   // optional; default 6-8
  "style": "cinematic",                              // matches frontend style IDs
  "refine": false                                    // optional: allow lighter/faster generation
}
```

**Response (200):**
```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "Narration/caption for the first beat...",
      "imagePrompt": "Prompt for keyframe/thumbnail generation",
      "bRollPrompt": "Prompt for supporting b-roll",
      "duration": 8
    }
  ],
  "totalDuration": 42,
  "averageSceneDuration": 7,
  "bRollCount": 6,
  "script": "Script text that was used",
  "refinedScript": "Optional refined version when refine=true"
}
```

**Notes:**
- Scene array order matters (`sceneNumber` ascending). The UI shows up to ~8 scenes.
- `duration` (seconds) is returned per scene and surfaced in the UI; `totalDuration`/`averageSceneDuration` summarize timing.
- Prompts should incorporate `style` (e.g., `4k-realistic`, `anime`, `cinematic`, `pixer-3d`) for style-aware text.
- Keep narration (`description`) under ~220 characters for readability.

### Optional: regenerate scenes
Expose `POST /api/projects/:projectId/scenes/:sceneId/regenerate` (already stubbed in `projectApi`) to redo a specific scene with the same style and context. Not currently wired in the UI but available for future use.

## Client-managed state
- Conversation history, titles, and flow state live in `localStorage` (`ai_script_conversations`).
- Style options are predefined in the frontend (`STYLE_OPTIONS`); backend only needs to accept `style.id`.

## Validation and limits
- Reject empty `prompt`/`script` with `400` and a clear `message`.
- Cap `sceneCount` to a reasonable max (e.g., 12) to keep responses fast.
- Trim or sanitize excessively long scripts to avoid overwhelming the UI.

## Example flows
1) **Write a script from topic** → `POST /api/ai/script` with `prompt` → show `script` → user clicks “Generate Scenes” → `POST /api/projects/generate-scenes` with `script` + `style`.
2) **Get a random script** → `POST /api/ai/script` with `topicCategory` + `format` → show `script` → same scene generation flow.
3) **Convert my script to scenes** → user pastes script → `POST /api/projects/generate-scenes` with pasted `script` + `style`.
