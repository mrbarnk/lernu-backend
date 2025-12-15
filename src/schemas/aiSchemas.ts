import { z } from "zod";

const styleEnum = z.enum([
  "4k-realistic",
  "clay",
  "cinematic",
  "brick",
  "grudge",
  "comic-book",
  "muppet",
  "ghibli",
  "playground",
  "voxel",
  "anime",
  "pixer-3d"
]);

export const generateScriptSchema = z.object({
  body: z
    .object({
      prompt: z.string().trim().min(1).max(4000).optional(),
      language: z.string().trim().min(2).max(10).default("en"),
      duration: z.string().trim().min(1).max(20).default("60s"),
      topicCategory: z.string().trim().min(1).max(100).optional(),
      format: z.string().trim().min(1).max(100).optional()
    })
    .superRefine((data, ctx) => {
      const hasPrompt = Boolean(data.prompt);
      const hasRandomInputs = Boolean(data.topicCategory && data.format);
      if (!hasPrompt && !hasRandomInputs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide either a prompt or both topicCategory and format"
        });
      }
    })
});

export const videoFromScriptSchema = z.object({
  body: z.object({
    script: z.string().min(1).max(5000),
    style: styleEnum.optional()
  })
});

export const listVideoGenerationsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    cursor: z.string().optional()
  })
});

export const processVideoSchema = z.object({
  params: z.object({
    id: z.string()
  })
});
