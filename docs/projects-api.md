# Projects API Specification

This document describes the backend API requirements for the Content Projects feature, which allows users to create AI video scripts with scene-by-scene breakdowns including image prompts and b-roll prompts.

## Overview

The Projects feature enables users to:
- Create multiple video script projects
- Generate scene breakdowns using AI (OpenAI GPT)
- Edit and manage individual scenes with image and b-roll prompts
- Track project status (draft, in-progress, completed)

---

## Data Models

### Project

```typescript
interface Project {
  id: string;              // UUID, primary key
  userId: string;          // UUID, references auth.users(id)
  title: string;           // Project title (max 200 chars)
  topic: string;           // Original topic/prompt used for generation (max 500 chars)
  description: string;     // Project description (max 2000 chars)
  status: 'draft' | 'in-progress' | 'completed';
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
}
```

### ProjectScene

```typescript
interface ProjectScene {
  id: string;              // UUID, primary key
  projectId: string;       // UUID, references projects(id)
  sceneNumber: number;     // Order of scene (1-indexed)
  description: string;     // Scene description/narration (max 2000 chars)
  imagePrompt: string;     // AI image generation prompt (max 1000 chars)
  bRollPrompt: string;     // B-roll/supplementary footage prompt (max 1000 chars)
  duration: number;        // Estimated duration in seconds (default: 10)
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
}
```

---

## API Endpoints

### Projects

#### List Projects
```
GET /api/projects
```

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| cursor | string | null | Pagination cursor (project ID) |
| limit | number | 20 | Items per page (max 50) |
| status | string | null | Filter by status: 'draft', 'in-progress', 'completed' |
| sort | string | 'updatedAt' | Sort field: 'createdAt', 'updatedAt', 'title' |
| order | string | 'desc' | Sort order: 'asc', 'desc' |

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "AI Revolution in Healthcare",
      "topic": "How AI is transforming medical diagnosis",
      "description": "A comprehensive video...",
      "status": "in-progress",
      "scenesCount": 4,
      "totalDuration": 45,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-16T14:30:00Z"
    }
  ],
  "nextCursor": "uuid-of-last-item" | null
}
```

#### Get Project
```
GET /api/projects/:id
```

**Authentication:** Required (owner only)

**Response:**
```json
{
  "id": "uuid",
  "title": "AI Revolution in Healthcare",
  "topic": "How AI is transforming medical diagnosis",
  "description": "A comprehensive video...",
  "status": "in-progress",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-16T14:30:00Z",
  "scenes": [
    {
      "id": "uuid",
      "sceneNumber": 1,
      "description": "Opening shot...",
      "imagePrompt": "Futuristic hospital lobby...",
      "bRollPrompt": "Doctors walking through...",
      "duration": 8
    }
  ]
}
```

#### Create Project
```
POST /api/projects
```

**Authentication:** Required

**Request Body:**
```json
{
  "title": "My Video Project",
  "topic": "How to create AI animations",
  "description": "Optional description",
  "generateScenes": true
}
```

**If `generateScenes: true`:** The backend should call OpenAI to generate scenes based on the topic.

**Response:** Same as Get Project

#### Update Project
```
PATCH /api/projects/:id
```

**Authentication:** Required (owner only)

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "completed"
}
```

**Response:** Same as Get Project

#### Delete Project
```
DELETE /api/projects/:id
```

**Authentication:** Required (owner only)

**Response:**
```json
{
  "success": true
}
```

---

### Scenes

#### Add Scene
```
POST /api/projects/:projectId/scenes
```

**Authentication:** Required (project owner only)

**Request Body:**
```json
{
  "description": "New scene description",
  "imagePrompt": "Image generation prompt",
  "bRollPrompt": "B-roll footage prompt",
  "duration": 15,
  "position": 3
}
```

**Note:** If `position` is provided, insert at that position and reorder subsequent scenes.

**Response:**
```json
{
  "id": "uuid",
  "sceneNumber": 3,
  "description": "New scene description",
  "imagePrompt": "Image generation prompt",
  "bRollPrompt": "B-roll footage prompt",
  "duration": 15,
  "createdAt": "2024-01-17T10:00:00Z",
  "updatedAt": "2024-01-17T10:00:00Z"
}
```

#### Update Scene
```
PATCH /api/projects/:projectId/scenes/:sceneId
```

**Authentication:** Required (project owner only)

**Request Body:**
```json
{
  "description": "Updated description",
  "imagePrompt": "Updated image prompt",
  "bRollPrompt": "Updated b-roll prompt",
  "duration": 20
}
```

**Response:** Same as Add Scene response

#### Delete Scene
```
DELETE /api/projects/:projectId/scenes/:sceneId
```

**Authentication:** Required (project owner only)

**Response:**
```json
{
  "success": true
}
```

**Note:** After deletion, reorder remaining scenes to maintain sequential sceneNumber.

#### Reorder Scenes
```
PUT /api/projects/:projectId/scenes/reorder
```

**Authentication:** Required (project owner only)

**Request Body:**
```json
{
  "sceneIds": ["uuid-scene-3", "uuid-scene-1", "uuid-scene-2"]
}
```

**Response:**
```json
{
  "success": true,
  "scenes": [
    { "id": "uuid-scene-3", "sceneNumber": 1 },
    { "id": "uuid-scene-1", "sceneNumber": 2 },
    { "id": "uuid-scene-2", "sceneNumber": 3 }
  ]
}
```

---

### AI Generation

#### Generate Scenes for Topic
```
POST /api/projects/generate-scenes
```

**Authentication:** Required

**Request Body:**
```json
{
  "topic": "How to create AI animations for beginners",
  "sceneCount": 4
}
```

**OpenAI Integration:**

Use OpenAI GPT model with the following system prompt:

```
You are an expert video content planner. Given a topic, create a scene-by-scene breakdown for a video script. For each scene, provide:
1. A description of what happens in the scene (narration/content)
2. An image prompt for AI image generation (detailed, cinematic style)
3. A b-roll prompt describing supplementary footage

Return your response as a JSON array of scenes.
```

**Response:**
```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "Opening hook introducing the topic...",
      "imagePrompt": "Cinematic wide shot of creative workspace...",
      "bRollPrompt": "Quick cuts of AI-generated animations...",
      "duration": 8
    },
    {
      "sceneNumber": 2,
      "description": "Main content explaining the core concepts...",
      "imagePrompt": "Detailed visualization of AI concepts...",
      "bRollPrompt": "Screen recordings of AI tools in action...",
      "duration": 20
    }
  ]
}
```

#### Regenerate Single Scene
```
POST /api/projects/:projectId/scenes/:sceneId/regenerate
```

**Authentication:** Required (project owner only)

**Request Body:**
```json
{
  "context": "Previous scenes context for continuity",
  "instructions": "Optional specific instructions"
}
```

**Response:** Same as Add Scene response

---

## Pagination Pattern

All list endpoints use cursor-based pagination for consistency with existing APIs.

**Request:**
```
GET /api/projects?cursor=last-item-uuid&limit=20
```

**Response:**
```json
{
  "items": [...],
  "nextCursor": "uuid-of-last-item" | null
}
```

- When `nextCursor` is `null`, there are no more items.
- The cursor should be the `id` of the last item in the current page.
- Backend should query: `WHERE id < cursor ORDER BY createdAt DESC LIMIT limit`

---

## Error Responses

All endpoints should return consistent error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found"
  }
}
```

**Common Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | User doesn't own the resource |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request body |
| RATE_LIMITED | 429 | Too many AI generation requests |
| AI_ERROR | 500 | OpenAI API failure |

---

## Rate Limiting

AI generation endpoints should be rate-limited:
- `POST /api/projects/generate-scenes`: 10 requests per hour per user
- `POST /api/projects/:id/scenes/:id/regenerate`: 20 requests per hour per user

---

## Database Schema (SQL Reference)

```sql
-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in-progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scenes table
CREATE TABLE public.project_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  image_prompt TEXT NOT NULL,
  b_roll_prompt TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, scene_number)
);

-- Indexes
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_project_scenes_project_id ON public.project_scenes(project_id);

-- RLS Policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD scenes of their projects"
  ON public.project_scenes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );
```

---

## Frontend Expectations

The frontend will:
1. Display paginated project list with infinite scroll
2. Show project details with all scenes
3. Allow inline editing of scenes
4. Copy prompts to clipboard for use in external AI tools
5. Support drag-and-drop scene reordering (future)

The frontend currently uses mock data and will switch to API calls once endpoints are available.
