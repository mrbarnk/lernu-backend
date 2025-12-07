import { z } from "zod";

export const userIdParamSchema = z.object({
  params: z.object({ id: z.string() })
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    bio: z.string().max(280).optional(),
    avatar: z.string().url().optional(),
    coverPhoto: z.string().url().optional()
  })
});
