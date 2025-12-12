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
  "comic-book",
  "muppet",
  "ghibli",
  "playground",
  "voxel",
  "anime",
  "pixer-3d"
]);
const sceneInputSchema = z.object({
  sceneNumber: z.number().int().min(1).optional(),
  description: z.string().min(1).max(2000),
  imagePrompt: z.string().max(1000).optional(),
  bRollPrompt: z.string().max(1000).optional(),
  duration: z.number().int().min(1).max(5).optional()
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
      style: styleEnum.optional()
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
    imagePrompt: z.string().max(1000).optional(),
    bRollPrompt: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(5).optional(),
    position: z.number().int().min(1).optional()
  })
});

export const updateSceneSchema = z.object({
  params: z.object({
    projectId: z.string(),
    sceneId: z.string()
  }),
  body: z.object({
    description: z.string().min(1).max(2000).optional(),
    imagePrompt: z.string().max(1000).optional(),
    bRollPrompt: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(5).optional()
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
      style: styleEnum.optional()
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
