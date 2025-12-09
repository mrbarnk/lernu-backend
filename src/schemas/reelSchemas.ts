import { z } from "zod";

export const createReelSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    videoUrl: z.string().url(),
    thumbnail: z.string().url().optional(),
    durationSeconds: z.number().optional(),
    tags: z.array(z.string()).max(5).optional()
  })
});

export const updateReelSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    videoUrl: z.string().url().optional(),
    thumbnail: z.string().url().optional(),
    durationSeconds: z.number().optional(),
    tags: z.array(z.string()).max(5).optional()
  })
});

export const reelCursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional()
  })
});

export const viewReelSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    watchedSeconds: z.number().min(0).max(36000).optional()
  })
});
