import { z } from "zod";

const codeSchema = z
  .object({
    language: z.string().optional(),
    snippet: z.string()
  })
  .optional();

const imagesSchema = z.array(z.string().url()).max(4).optional();
const tagsSchema = z.array(z.string()).max(5).optional();

export const createPostSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    categoryId: z.string(),
    code: codeSchema,
    images: imagesSchema,
    tags: tagsSchema
  })
});

export const updatePostSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    categoryId: z.string().optional(),
    code: codeSchema,
    images: imagesSchema,
    tags: tagsSchema,
    isPinned: z.boolean().optional(),
    isSolved: z.boolean().optional()
  })
});

export const cursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional(),
    categoryId: z.string().optional(),
    search: z.string().optional(),
    type: z.enum(["quality"]).optional()
  })
});

export const trendingTagsSchema = z.object({
  query: z.object({
    limit: z.string().optional()
  })
});
