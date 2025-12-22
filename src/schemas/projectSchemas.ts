import { z } from "zod";

const statusEnum = z.enum(["draft", "in-progress", "completed"]);
const sortEnum = z.enum(["createdAt", "updatedAt", "title"]);
const orderEnum = z.enum(["asc", "desc"]);
const styleEnum = z.enum([
  "4k-realistic",
  "clay",
  "cinematic",
  "brick",
  "grudge",
  "grunge",
  "comic-book",
  "muppet",
  "ghibli",
  "playground",
  "voxel",
  "anime",
  "pixar3d",
  "grunge"
]);
const providerEnum = z.enum(["openai", "gemini", "veo"]);
const previewProviderEnum = z.enum(["ffmpeg"]);
const sceneInputSchema = z.object({
  sceneNumber: z.number().int().min(1).optional(),
  description: z.string().min(1).max(2000),
  narration: z.string().min(1).max(2000).optional(),
  captionText: z.string().max(2000).optional(),
  timingPlan: z.record(z.any()).optional(),
  imagePrompt: z.string().max(1000).optional(),
  bRollPrompt: z.string().max(1000).optional(),
  duration: z.number().int().min(1).max(6).optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  mediaUri: z.string().max(2000).optional(),
  mediaTrimStart: z.number().min(0).optional(),
  mediaTrimEnd: z.number().min(0).optional(),
  mediaAnimation: z.string().max(200).optional()
});

export const listProjectsSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().optional(),
    status: statusEnum.optional(),
    sort: sortEnum.optional(),
    order: orderEnum.optional()
  })
});

export const getProjectSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

export const createProjectSchema = z.object({
  body: z
    .object({
      title: z.string().min(1).max(200),
      topic: z.string().min(1).max(500).optional(),
      description: z.string().max(2000).optional(),
      generateScenes: z.boolean().optional(),
      sceneCount: z.number().int().min(1).max(20).optional(),
      script: z.string().min(1).max(5000).optional(),
      scenes: z.array(sceneInputSchema).max(50).optional(),
      style: styleEnum.optional(),
      provider: providerEnum.optional(),
      refine: z.boolean().optional()
    })
    .refine(
      (data) =>
        data.generateScenes
          ? Boolean(data.script)
          : Boolean(data.topic || data.script || (data.scenes && data.scenes.length > 0)),
      "Provide a script when auto-generating, or include topic/script/scenes"
    )
});

export const updateProjectSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: statusEnum.optional(),
    style: styleEnum.optional()
  })
});

export const addSceneSchema = z.object({
  params: z.object({
    projectId: z.string()
  }),
  body: z.object({
    description: z.string().min(1).max(2000),
    narration: z.string().min(1).max(2000).optional(),
    captionText: z.string().max(2000).optional(),
    timingPlan: z.record(z.any()).optional(),
    imagePrompt: z.string().max(1000).optional(),
    bRollPrompt: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(6).optional(),
    position: z.number().int().min(1).optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    mediaUri: z.string().max(2000).optional(),
    mediaTrimStart: z.number().min(0).optional(),
    mediaTrimEnd: z.number().min(0).optional(),
    mediaAnimation: z.string().max(200).optional()
  })
});

export const updateSceneSchema = z.object({
  params: z.object({
    projectId: z.string(),
    sceneId: z.string()
  }),
  body: z.object({
    description: z.string().min(1).max(2000).optional(),
    narration: z.string().min(1).max(2000).optional(),
    captionText: z.string().max(2000).optional(),
    timingPlan: z.record(z.any()).optional(),
    imagePrompt: z.string().max(1000).optional(),
    bRollPrompt: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(6).optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    mediaUri: z.string().max(2000).optional(),
    mediaTrimStart: z.number().min(0).optional(),
    mediaTrimEnd: z.number().min(0).optional(),
    mediaAnimation: z.string().max(200).optional()
  })
});

export const reorderScenesSchema = z.object({
  params: z.object({
    projectId: z.string()
  }),
  body: z.object({
    sceneIds: z.array(z.string()).min(1)
  })
});

export const generateScenesSchema = z.object({
  body: z
    .object({
      topic: z.string().min(1).max(500).optional(),
      sceneCount: z.number().int().min(1).max(20).optional(),
      script: z.string().min(1).max(5000),
      style: styleEnum.optional(),
      provider: providerEnum.optional(),
      refine: z.boolean().optional(),
      createProject: z.boolean().optional()
    })
});

export const regenerateSceneSchema = z.object({
  params: z.object({
    projectId: z.string(),
    sceneId: z.string()
  }),
  body: z.object({
    context: z.string().max(4000).optional(),
    instructions: z.string().max(2000).optional(),
    topic: z.string().max(500).optional(),
    script: z.string().max(5000).optional()
  })
});

export const generateSceneAudioSchema = z.object({
  params: z.object({
    projectId: z.string(),
    sceneId: z.string()
  }),
  body: z.object({
    voiceId: z.string().max(100).optional(),
    modelId: z.string().max(200).optional()
  })
});

export const generateVideoSchema = z.object({
  params: z.object({
    projectId: z.string()
  }),
  body: z
    .object({
      provider: providerEnum.optional()
    })
    .optional()
});

export const generatePreviewSchema = z.object({
  params: z.object({
    projectId: z.string()
  }),
  body: z
    .object({
      quality: z.enum(["sd", "hd"]).optional(),
      provider: previewProviderEnum.optional()
    })
    .optional()
});

export const videoStatusSchema = z.object({
  params: z.object({
    projectId: z.string()
  }),
  query: z.object({
    operationName: z.string().optional()
  })
});
