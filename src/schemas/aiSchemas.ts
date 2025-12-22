import { z } from "zod";
import { Types } from "mongoose";

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

const objectId = z
  .string()
  .trim()
  .refine((val) => Types.ObjectId.isValid(val), "Invalid id");

const conversationMetaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  flowStep: z.string().trim().max(100).optional(),
  generatedScript: z.string().trim().max(20000).optional(),
  selectedTopic: z.string().trim().max(500).optional(),
  selectedTopicId: z.string().trim().max(200).optional(),
  selectedFormat: z.string().trim().max(200).optional(),
  selectedFormatId: z.string().trim().max(200).optional(),
  selectedStyle: z.any().optional(),
  selectedDuration: z.string().trim().max(50).optional()
});

const sceneSchema = z.object({
  id: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200),
  sceneNumber: z.number().int().min(1),
  audioCaption: z.string().trim().min(1).max(1000),
  narration: z.string().trim().min(1).max(2000).optional(),
  captionText: z.string().trim().max(2000).optional(),
  timingPlan: z.record(z.any()).optional(),
  videoPrompt: z.string().trim().max(2000).optional(),
  imagePrompt: z.string().trim().max(2000).optional(),
  duration: z.number().int().positive().max(600).optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  mediaUri: z.string().trim().max(2000).optional(),
  mediaTrimStart: z.number().min(0).optional(),
  mediaTrimEnd: z.number().min(0).optional(),
  mediaAnimation: z.string().trim().max(200).optional()
});

export const generateScriptSchema = z.object({
  body: z
    .object({
      prompt: z.string().trim().min(1).max(4000).optional(),
      language: z.string().trim().min(2).max(10).default("en"),
      duration: z.string().trim().min(1).max(20).default("60s"),
      topicCategory: z.string().trim().min(1).max(100).optional(),
      format: z.string().trim().min(1).max(100).optional(),
      model: z.string().trim().max(100).optional()
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
    style: styleEnum.optional(),
    voiceId: z.string().trim().max(100).optional(),
    musicTrackId: z.string().trim().max(100).optional(),
    musicVolume: z.number().min(0).max(1).optional()
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

export const listConversationsSchema = z.object({
  query: z.object({
    limit: z.string().optional()
  })
});

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(200).optional()
  })
});

export const getConversationSchema = z.object({
  params: z.object({
    id: objectId
  })
});

export const updateConversationSchema = z.object({
  params: z.object({
    id: objectId
  }),
  body: conversationMetaSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update")
});

export const deleteConversationSchema = z.object({
  params: z.object({
    id: objectId
  })
});

export const addConversationMessageSchema = z.object({
  params: z.object({
    id: objectId
  }),
  body: z.object({
    role: z.enum(["assistant", "user"]),
    content: z.string().trim().min(1).max(20000),
    options: z.any().optional(),
    scenes: z.array(sceneSchema).optional()
  })
});
