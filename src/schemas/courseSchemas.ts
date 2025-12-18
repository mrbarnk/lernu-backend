import { z } from "zod";

const difficultyEnum = z.enum(["beginner", "intermediate", "advanced"]);

export const courseCreateSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(400),
    content: z.string().trim().min(10),
    thumbnail: z.string().trim().url().optional(),
    category: z.string().trim().min(2).max(120),
    difficulty: difficultyEnum,
    durationMinutes: z.number().int().nonnegative().default(0),
    lessonsCount: z.number().int().nonnegative().optional(),
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional()
  })
});

export const courseUpdateSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(10).max(400).optional(),
    content: z.string().trim().min(10).optional(),
    thumbnail: z.string().trim().url().optional(),
    category: z.string().trim().min(2).max(120).optional(),
    difficulty: difficultyEnum.optional(),
    durationMinutes: z.number().int().nonnegative().optional(),
    lessonsCount: z.number().int().nonnegative().optional(),
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional()
  })
});

export const lessonCreateSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(180),
    content: z.string().trim().min(5),
    videoUrl: z.string().trim().url().optional(),
    durationMinutes: z.number().int().nonnegative().default(0),
    orderIndex: z.number().int().nonnegative().optional(),
    isFree: z.boolean().optional()
  })
});

export const lessonUpdateSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(180).optional(),
    content: z.string().trim().min(5).optional(),
    videoUrl: z.string().trim().url().optional(),
    durationMinutes: z.number().int().nonnegative().optional(),
    orderIndex: z.number().int().nonnegative().optional(),
    isFree: z.boolean().optional()
  })
});
