import { z } from "zod";

const codeSchema = z
  .object({
    language: z.string().optional(),
    snippet: z.string()
  })
  .optional();

const imagesSchema = z.array(z.string().url()).max(4).optional();

export const createCommentSchema = z.object({
  body: z.object({
    postId: z.string(),
    content: z.string().min(1),
    code: codeSchema,
    images: imagesSchema
  })
});

export const updateCommentSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    content: z.string().min(1).optional(),
    code: codeSchema,
    images: imagesSchema,
    isAccepted: z.boolean().optional()
  })
});

export const commentsCursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional()
  })
});
