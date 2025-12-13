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
  body: z.object({
    prompt: z.string().min(1).max(2000),
    language: z.enum(["en-us", "en-uk", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"]),
    duration: z.enum(["15-30", "30-40", "40-60", "60-90"])
  })
});

export const videoFromScriptSchema = z.object({
  body: z.object({
    script: z.string().min(1).max(5000),
    style: styleEnum.optional()
  })
});
