import { z } from "zod";

export const contactSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name is required"),
    email: z.string().trim().email("Valid email required"),
    subject: z.string().trim().min(3, "Subject is required").max(120, "Subject too long"),
    message: z.string().trim().min(10, "Message is too short").max(2000, "Message too long")
  })
});
