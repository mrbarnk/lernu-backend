# Courses API Integration Guide

This document defines what the backend must provide so the Courses feature (browse, enroll, track progress, edit) can replace the current mocked data in `useCourses`.

## Data Models

```ts
interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;   // optional icon name
  color?: string;  // optional color token/hex
}

interface Course {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string; // URL
  title: string;
  slug: string;          // unique, URL-safe
  description: string;
  content: string;       // rich HTML/markdown
  thumbnail?: string;    // image URL
  category: string;      // category slug
  difficulty: "beginner" | "intermediate" | "advanced";
  durationMinutes: number;
  lessonsCount: number;
  enrolledCount: number;
  isPublished: boolean;
  isFeatured: boolean;
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  lessons?: CourseLesson[];
}

interface CourseLesson {
  id: string;
  courseId: string;
  title: string;
  content: string;       // rich HTML/markdown
  videoUrl?: string;
  durationMinutes: number;
  orderIndex: number;    // 0-based ordering
  isFree: boolean;
}

interface CourseProgress {
  courseId: string;
  completedLessons: string[];
  progressPercent: number;
  startedAt: string;
  lastAccessedAt: string;
  completedAt?: string;
}
```

## Endpoints

### Categories
- `GET /course-categories` → `{ categories: CourseCategory[] }`

### Courses
- `GET /courses`
  - Query: `search`, `category`, `difficulty`, `featured` (bool), `enrolled` (bool for current user), `cursor`, `limit`.
  - Returns paginated `{ items: Course[], nextCursor: string | null }`. Exclude unpublished unless caller is owner/admin.
- `GET /courses/:slug`
  - Returns full `Course` with `lessons` array for display and lesson navigation.
- `POST /courses`
  - Auth required. Body: all fields except `id/enrolledCount/createdAt/updatedAt`. Slug must be unique; backend can slugify.
- `PATCH /courses/:id`
  - Auth required (owner/admin). Fields: title, description, content, thumbnail, category, difficulty, isPublished, isFeatured, durationMinutes, lessonsCount.
- `DELETE /courses/:id`
  - Auth required (owner/admin).
- `POST /courses/:id/publish` (optional)
  - Toggle publish state if you prefer a dedicated endpoint.

### Lessons
- `GET /courses/:id/lessons`
  - Returns ordered `CourseLesson[]` (or include in `GET /courses/:slug`).
- `POST /courses/:id/lessons`
  - Auth required. Body: `title`, `content`, `videoUrl?`, `durationMinutes`, `orderIndex`, `isFree`.
- `PATCH /courses/:id/lessons/:lessonId`
  - Auth required. Same fields as create; support reordering via `orderIndex`.
- `DELETE /courses/:id/lessons/:lessonId`
  - Auth required.

### Enrollment and Progress (per authenticated user)
- `POST /courses/:id/enroll` → `{ enrolledAt }`
- `DELETE /courses/:id/enroll`
- `GET /courses/:id/progress` → `CourseProgress` (creates an empty record if none exists is acceptable).
- `POST /courses/:id/lessons/:lessonId/complete`
  - Marks lesson complete and returns updated `CourseProgress` with `progressPercent` recalculated from total lessons.

### Featured/Sidebar
- `GET /courses/featured` (optional shortcut) → subset of featured, published courses used on the home page.

### Assets
- Provide an image upload endpoint (e.g., `POST /uploads/images`) that returns a thumbnail URL for courses.

## Behavior Notes
- Pagination: cursor-based preferred; `limit` sensible default (e.g., 10–20).
- Slugs: must be unique; backend should 409 on conflicts.
- Visibility: `isPublished=false` courses should only be visible/editable to owner/admin.
- Counts: `enrolledCount` should reflect total enrollments; update on enroll/unenroll.
- Lessons ordering: honor `orderIndex`; UI expects lessons sorted ascending.
- Progress: `progressPercent = completedLessons.length / lessonsCount * 100` (rounded).
- Auth: create/update/delete/enroll/progress all require authentication; listing/published detail can be public.
