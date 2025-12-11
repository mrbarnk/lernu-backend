import { z } from "zod";

export const communityCursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional()
  })
});

const codeSchema = z
  .object({
    language: z.string().optional(),
    snippet: z.string()
  })
  .optional();

const imagesSchema = z.array(z.string().url()).max(4).optional();

export const communityPostSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    code: codeSchema,
    images: imagesSchema
  })
});

export const communityReplySchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    content: z.string().min(1),
    code: codeSchema,
    images: imagesSchema
  })
});
