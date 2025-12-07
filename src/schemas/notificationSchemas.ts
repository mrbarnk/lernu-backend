import { z } from "zod";

export const notificationsCursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional(),
    unreadOnly: z.string().optional()
  })
});

export const notificationReadSchema = z.object({
  params: z.object({ id: z.string() })
});
