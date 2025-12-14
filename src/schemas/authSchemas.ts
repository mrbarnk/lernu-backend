import { z } from "zod";

export const signupSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    username: z.string().min(3),
    displayName: z.string().min(2),
    ref: z.string().trim().max(100).optional()
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6)
  })
});
