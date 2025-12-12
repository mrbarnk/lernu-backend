import { Request, Response } from "express";
import { FilterQuery, SortOrder, Types } from "mongoose";
import { Project, ProjectDocument, ProjectStatus, ProjectStyle } from "../models/Project";
import { ProjectScene, ProjectSceneAttrs, ProjectSceneDocument } from "../models/ProjectScene";
import { HttpError } from "../middleware/error";
import {
  AiScene,
  generateScenesForTopic,
  regenerateSceneWithAi
} from "../services/projectAiService";
import { recordAiUsage } from "../services/aiUsageService";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const AI_WINDOW_MS = 60 * 60 * 1000;
const SCENE_REORDER_OFFSET = 1000;

const aiBuckets = new Map<string, number[]>();

const enforceAiRateLimit = (key: string, limit: number, message: string) => {
  const now = Date.now();
  const recent = (aiBuckets.get(key) ?? []).filter((ts) => now - ts < AI_WINDOW_MS);
  if (recent.length >= limit) throw new HttpError(429, message);
  recent.push(now);
  aiBuckets.set(key, recent);
};

const ensureObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

type ScenePayload = {
  _id: Types.ObjectId;
  projectId?: Types.ObjectId;
  sceneNumber: number;
  description: string;
  imagePrompt?: string;
  bRollPrompt?: string;
  duration?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

const deriveTopicFromScenes = (scenes: ScenePayload[]) => {
  if (!scenes.length) return undefined;
  const first = scenes[0]?.description ?? "";
  const cleaned = first.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 120) : undefined;
};

const computeSceneStats = (scenes: ScenePayload[]) => {
  const scenesCount = scenes.length;
  const totalDuration = scenes.reduce((acc, scene) => acc + (scene.duration ?? 0), 0);
  const averageSceneDuration = scenesCount ? totalDuration / scenesCount : 0;
  return { scenesCount, totalDuration, averageSceneDuration };
};

const serializeScene = (scene: ScenePayload) => ({
  id: scene._id.toString(),
  sceneNumber: scene.sceneNumber,
  description: scene.description,
  imagePrompt: scene.imagePrompt ?? "",
  bRollPrompt: scene.bRollPrompt ?? "",
  duration: scene.duration ?? 5,
  createdAt: scene.createdAt,
  updatedAt: scene.updatedAt
});

const serializeProject = (project: ProjectDocument & { _id: Types.ObjectId }, scenes?: ScenePayload[]) => ({
  id: project._id.toString(),
  title: project.title,
  topic: project.topic,
  description: project.description,
  script: project.script,
  refinedScript: project.refinedScript,
  status: project.status,
  style: project.style,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  ...(scenes
    ? (() => {
        const stats = computeSceneStats(scenes);
        return {
          scenes: scenes.map(serializeScene),
          scenesCount: stats.scenesCount,
          totalDuration: stats.totalDuration,
          averageSceneDuration: stats.averageSceneDuration
        };
      })()
    : {})
});

const ensureProjectOwned = async (projectId: string, userId: Types.ObjectId) => {
  ensureObjectId(projectId, "Invalid project id");
  const project = await Project.findOne({ _id: projectId, userId });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
};

const parseLimit = (value?: string) =>
  Math.min(MAX_LIMIT, Math.max(1, Number(value) || DEFAULT_LIMIT));

const parseOrder = (order?: string) => (order === "asc" ? 1 : -1);

const normalizeInputScenes = (scenes: unknown[]) => {
  if (!Array.isArray(scenes)) return [] as ScenePayload[];
  const maxScenes = 50;
  return scenes
    .slice(0, maxScenes)
    .map((scene, idx) => {
      const description =
        typeof (scene as any)?.description === "string"
          ? (scene as any).description.trim().slice(0, 2000)
          : "";
      if (!description) return null;
      const imagePrompt =
        typeof (scene as any)?.imagePrompt === "string"
          ? (scene as any).imagePrompt.trim().slice(0, 1000)
          : undefined;
      const bRollPrompt =
        typeof (scene as any)?.bRollPrompt === "string"
          ? (scene as any).bRollPrompt.trim().slice(0, 1000)
          : undefined;
      const rawDuration = Number((scene as any)?.duration);
      const duration = Number.isFinite(rawDuration) ? Math.min(6, Math.max(1, rawDuration)) : 5;
      const sceneNumber =
        typeof (scene as any)?.sceneNumber === "number" && (scene as any).sceneNumber > 0
          ? (scene as any).sceneNumber
          : idx + 1;
      return {
        _id: new Types.ObjectId(),
        sceneNumber,
        description,
        imagePrompt,
        bRollPrompt,
        duration
      } as ScenePayload;
    })
    .filter((scene): scene is ScenePayload => Boolean(scene));
};

const buildSceneContext = (scenes: ProjectSceneDocument[], targetSceneNumber: number) => {
  const neighbors = scenes
    .filter((scene) => Math.abs(scene.sceneNumber - targetSceneNumber) <= 1)
    .map((scene) => ({
      sceneNumber: scene.sceneNumber,
      description: scene.description,
      imagePrompt: scene.imagePrompt,
      bRollPrompt: scene.bRollPrompt
    }));
  return JSON.stringify(neighbors);
};

const applySceneOrder = async (projectId: Types.ObjectId, sceneIds: string[]) => {
  const tempOperations = sceneIds.map((id, idx) => ({
    updateOne: {
      filter: { _id: new Types.ObjectId(id), projectId },
      update: { sceneNumber: idx + 1 + SCENE_REORDER_OFFSET }
    }
  }));
  const finalOperations = sceneIds.map((id, idx) => ({
    updateOne: {
      filter: { _id: new Types.ObjectId(id), projectId },
      update: { sceneNumber: idx + 1 }
    }
  }));

  await ProjectScene.bulkWrite(tempOperations);
  await ProjectScene.bulkWrite(finalOperations);
  return sceneIds.map((id, idx) => ({ id, sceneNumber: idx + 1 }));
};

const deriveTopicFromScript = (script?: string) => {
  if (!script) return undefined;
  const cleaned = script.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 120);
};

const estimateSceneCountFromScript = (script?: string, fallback = 4) => {
  if (!script) return fallback;
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const estimated = Math.max(1, Math.ceil(words / 45));
  return Math.min(20, estimated);
};

const statsForProjects = async (projectIds: Types.ObjectId[]) => {
  if (!projectIds.length) return new Map<string, { scenesCount: number; totalDuration: number }>();
  const stats = await ProjectScene.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    { $group: { _id: "$projectId", scenesCount: { $sum: 1 }, totalDuration: { $sum: "$duration" } } }
  ]);

  const map = new Map<string, { scenesCount: number; totalDuration: number }>();
  stats.forEach((stat) =>
    map.set(stat._id.toString(), {
      scenesCount: stat.scenesCount ?? 0,
      totalDuration: stat.totalDuration ?? 0
    })
  );
  return map;
};

export const listProjects = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const limit = parseLimit(req.query.limit as string);
  const status = req.query.status as ProjectStatus | undefined;
  const sortField = (req.query.sort as string) || "updatedAt";
  const order = parseOrder(req.query.order as string);
  const cursorId = req.query.cursor as string | undefined;

  const filter: FilterQuery<ProjectDocument> = { userId: req.user._id };
  if (status) filter.status = status;

  if (cursorId) {
    ensureObjectId(cursorId, "Invalid cursor");
    const cursorProject = await Project.findOne({ _id: cursorId, userId: req.user._id });
    if (!cursorProject) throw new HttpError(400, "Invalid cursor");
    const comparator = order === 1 ? "$gt" : "$lt";
    const cursorValue = (cursorProject as any)[sortField] ?? null;
    filter.$or = [
      { [sortField]: { [comparator]: cursorValue } },
      { [sortField]: cursorValue, _id: { [comparator]: cursorProject._id } }
    ];
  }

  const sort: Record<string, SortOrder> = { [sortField]: order, _id: order };
  const projects = await Project.find(filter).sort(sort).limit(limit + 1).lean();
  const items = projects.slice(0, limit);
  const stats = await statsForProjects(items.map((p) => p._id as Types.ObjectId));

  const responseItems = items.map((project) => ({
    id: project._id.toString(),
    title: project.title,
    topic: project.topic,
    description: project.description,
    status: project.status,
    style: project.style,
    scenesCount: stats.get(project._id.toString())?.scenesCount ?? 0,
    totalDuration: stats.get(project._id.toString())?.totalDuration ?? 0,
    averageSceneDuration:
      (stats.get(project._id.toString())?.totalDuration ?? 0) /
      Math.max(1, stats.get(project._id.toString())?.scenesCount ?? 1),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }));

  const nextCursor = projects.length > limit ? projects[limit]._id.toString() : null;

  res.json({ items: responseItems, nextCursor });
};

export const getProject = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.id, req.user._id);
  const scenes = await ProjectScene.find({ projectId: project._id })
    .sort({ sceneNumber: 1 })
    .lean();
  res.json(
    serializeProject(project as ProjectDocument & { _id: Types.ObjectId }, scenes as ScenePayload[])
  );
};

export const createProject = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const {
    title,
    topic,
    description,
    generateScenes: shouldGenerate,
    sceneCount,
    script,
    style,
    scenes,
    provider,
    refine
  } = req.body as {
    title: string;
    topic?: string;
    description?: string;
    generateScenes?: boolean;
    sceneCount?: number;
    script?: string;
    style?: ProjectStyle;
    scenes?: unknown[];
    provider?: "openai" | "gemini";
    refine?: boolean;
  };
  const scriptText = typeof script === "string" ? script : undefined;
  const providedScenes = normalizeInputScenes(scenes ?? []);

  const topicValue = topic ?? deriveTopicFromScript(scriptText) ?? deriveTopicFromScenes(providedScenes);
  if (!topicValue) throw new HttpError(400, "Topic, script, or scene descriptions are required");

  const targetSceneCount = sceneCount ?? estimateSceneCountFromScript(scriptText);

  let generatedScenes: AiScene[] = [];
  let refinedScriptUsed: string | undefined;
  if (shouldGenerate) {
    if (!scriptText) throw new HttpError(400, "Script is required to generate scenes");
    enforceAiRateLimit(
      `${req.user._id.toString()}:generate`,
      10,
      "Too many AI scene generations. Try again later."
    );
    const generationResult = await generateScenesForTopic({
      topic: topicValue,
      sceneCount: targetSceneCount,
      script: scriptText,
      style,
      provider,
      refine
    });
    generatedScenes = generationResult.scenes;
    refinedScriptUsed = generationResult.refinedScript ?? generationResult.scriptUsed ?? scriptText;
    await recordAiUsage({
      userId: req.user._id,
      action: "project:create:generate-scenes",
      usage: generationResult.usage,
      metadata: { projectTitle: title, provider: provider ?? "openai" }
    });
    if (generationResult.refinementUsage) {
      await recordAiUsage({
        userId: req.user._id,
        action: "project:create:refine-script",
        usage: generationResult.refinementUsage,
        metadata: { projectTitle: title, provider: provider ?? "openai" }
      });
    }
  }

  const generatedScenesNormalized: ScenePayload[] = generatedScenes.map((scene, idx) => ({
    _id: new Types.ObjectId(),
    sceneNumber: scene.sceneNumber ?? idx + 1,
    description: scene.description,
    imagePrompt: scene.imagePrompt,
    bRollPrompt: scene.bRollPrompt,
    duration: scene.duration
  }));

  const scenesToInsert: ScenePayload[] = providedScenes.length ? providedScenes : generatedScenesNormalized;

  const project = await Project.create({
    userId: req.user._id,
    title,
    topic: topicValue,
    description,
    style,
    script: scriptText,
    refinedScript: refinedScriptUsed,
    status: shouldGenerate ? "in-progress" : "draft"
  });

  if (scenesToInsert.length) {
    const sortedScenes = scenesToInsert
      .map((scene, idx) => ({
        ...scene,
        projectId: project._id,
        sceneNumber: scene.sceneNumber ?? idx + 1
      }))
      .sort((a, b) => a.sceneNumber - b.sceneNumber);

    await ProjectScene.insertMany(
      sortedScenes.map((scene) => ({
        projectId: project._id,
        sceneNumber: scene.sceneNumber,
        description: scene.description,
        imagePrompt: scene.imagePrompt,
        bRollPrompt: scene.bRollPrompt,
        duration: scene.duration
      }))
    );
  }

  const projectScenes = scenesToInsert.length
    ? await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 }).lean()
    : [];

  res
    .status(201)
    .json(
      serializeProject(
        project as ProjectDocument & { _id: Types.ObjectId },
        projectScenes as ScenePayload[]
      )
    );
};

export const updateProject = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.id, req.user._id);
  const { title, description, status, style } = req.body as {
    title?: string;
    description?: string;
    status?: ProjectStatus;
    style?: ProjectStyle;
  };

  if (title !== undefined) project.title = title;
  if (description !== undefined) project.description = description;
  if (status !== undefined) project.status = status;
  if (style !== undefined) project.style = style;

  await project.save();

  const scenes = await ProjectScene.find({ projectId: project._id })
    .sort({ sceneNumber: 1 })
    .lean();

  res.json(serializeProject(project, scenes as ScenePayload[]));
};

export const deleteProject = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.id, req.user._id);
  await ProjectScene.deleteMany({ projectId: project._id });
  await project.deleteOne();
  res.json({ success: true });
};

export const addScene = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const { description, imagePrompt, bRollPrompt, duration, position } = req.body as {
    description: string;
    imagePrompt?: string;
    bRollPrompt?: string;
    duration?: number;
    position?: number;
  };

  const existingCount = await ProjectScene.countDocuments({ projectId: project._id });
  const targetPosition = position ? Math.min(Math.max(position, 1), existingCount + 1) : existingCount + 1;

  if (targetPosition <= existingCount) {
    await ProjectScene.updateMany(
      { projectId: project._id, sceneNumber: { $gte: targetPosition } },
      { $inc: { sceneNumber: SCENE_REORDER_OFFSET } }
    );
    await ProjectScene.updateMany(
      {
        projectId: project._id,
        sceneNumber: { $gte: targetPosition + SCENE_REORDER_OFFSET }
      },
      { $inc: { sceneNumber: 1 - SCENE_REORDER_OFFSET } }
    );
  }

  const scene = await ProjectScene.create({
    projectId: project._id,
    sceneNumber: targetPosition,
    description,
    imagePrompt,
    bRollPrompt,
    duration: duration ?? 5
  });

  res.status(201).json(serializeScene(scene as ProjectSceneDocument & { _id: Types.ObjectId }));
};

export const updateScene = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  ensureObjectId(req.params.sceneId, "Invalid scene id");

  const scene = await ProjectScene.findOne({ _id: req.params.sceneId, projectId: project._id });
  if (!scene) throw new HttpError(404, "Scene not found");

  const { description, imagePrompt, bRollPrompt, duration } = req.body as {
    description?: string;
    imagePrompt?: string;
    bRollPrompt?: string;
    duration?: number;
  };

  if (description !== undefined) scene.description = description;
  if (imagePrompt !== undefined) scene.imagePrompt = imagePrompt;
  if (bRollPrompt !== undefined) scene.bRollPrompt = bRollPrompt;
  if (duration !== undefined) scene.duration = duration;

  await scene.save();

  res.json(serializeScene(scene as ProjectSceneDocument & { _id: Types.ObjectId }));
};

export const deleteScene = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  ensureObjectId(req.params.sceneId, "Invalid scene id");

  const scene = await ProjectScene.findOne({ _id: req.params.sceneId, projectId: project._id });
  if (!scene) throw new HttpError(404, "Scene not found");
  const deletedSceneNumber = scene.sceneNumber;

  await scene.deleteOne();
  await ProjectScene.updateMany(
    { projectId: project._id, sceneNumber: { $gt: deletedSceneNumber } },
    { $inc: { sceneNumber: -1 } }
  );

  res.json({ success: true });
};

export const reorderScenes = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const sceneIds = (req.body.sceneIds as string[] | undefined) ?? [];

  if (!sceneIds.length) throw new HttpError(400, "sceneIds are required");

  const scenes = await ProjectScene.find({ projectId: project._id }).lean();
  if (sceneIds.length !== scenes.length) throw new HttpError(400, "sceneIds count mismatch");

  const existingIds = new Set(scenes.map((scene) => scene._id.toString()));
  const providedIds = new Set(sceneIds);
  if (existingIds.size !== providedIds.size || sceneIds.some((id) => !existingIds.has(id))) {
    throw new HttpError(400, "sceneIds must include all scenes exactly once");
  }

  const updated = await applySceneOrder(project._id, sceneIds);
  res.json({ success: true, scenes: updated });
};

export const generateScenes = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { topic: rawTopic, sceneCount, script, style, provider, refine } = req.body as {
    topic?: string;
    sceneCount?: number;
    script?: string;
    style?: ProjectStyle;
    provider?: "openai" | "gemini";
    refine?: boolean;
  };

  const scriptText = typeof script === "string" ? script : undefined;
  if (!scriptText) throw new HttpError(400, "Script is required");
  const topic = rawTopic ?? deriveTopicFromScript(scriptText);
  if (!topic) throw new HttpError(400, "Script is required to derive a topic");
  const targetSceneCount = sceneCount ?? estimateSceneCountFromScript(scriptText);

  enforceAiRateLimit(
    `${req.user._id.toString()}:generate`,
    10,
    "Too many AI scene generations. Try again later."
  );

  const generationResult = await generateScenesForTopic({
    topic,
    sceneCount: targetSceneCount,
    script: scriptText,
    style,
    provider,
    refine
  });
  const scenes = generationResult.scenes;
  const totalDuration = scenes.reduce((acc, scene) => acc + (scene.duration ?? 0), 0);
  const averageSceneDuration = scenes.length ? totalDuration / scenes.length : 0;

  await recordAiUsage({
    userId: req.user._id,
    action: "project:generate-scenes",
    usage: generationResult.usage,
    metadata: { topic, provider: provider ?? "openai" }
  });
  if (generationResult.refinementUsage) {
    await recordAiUsage({
      userId: req.user._id,
      action: "project:generate-scenes:refine-script",
      usage: generationResult.refinementUsage,
      metadata: { topic, provider: provider ?? "openai" }
    });
  }

  res.json({
    scenes,
    totalDuration,
    averageSceneDuration,
    bRollCount: scenes.length,
    script: generationResult.scriptUsed ?? scriptText,
    refinedScript: generationResult.refinedScript
  });
};

export const regenerateScene = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  ensureObjectId(req.params.sceneId, "Invalid scene id");

  const scene = await ProjectScene.findOne({ _id: req.params.sceneId, projectId: project._id });
  if (!scene) throw new HttpError(404, "Scene not found");

  const { context: customContext, instructions, script } = req.body as {
    context?: string;
    instructions?: string;
    script?: string;
  };

  enforceAiRateLimit(
    `${req.user._id.toString()}:regenerate`,
    20,
    "Too many scene regenerations. Try again later."
  );

  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });
  const context =
    customContext ||
    buildSceneContext(scenes as ProjectSceneDocument[], (scene as ProjectSceneDocument).sceneNumber);

  const regenerated = await regenerateSceneWithAi({
    topic: project.topic,
    sceneNumber: scene.sceneNumber,
    context,
    instructions,
    script,
    style: project.style
  });

  scene.description = regenerated.scene.description;
  scene.imagePrompt = regenerated.scene.imagePrompt;
  scene.bRollPrompt = regenerated.scene.bRollPrompt;
  scene.duration = regenerated.scene.duration;
  await scene.save();

  await recordAiUsage({
    userId: req.user._id,
    action: "project:scene:regenerate",
    usage: regenerated.usage,
    metadata: { projectId: project._id.toString(), sceneId: scene._id.toString() }
  });

  res.json(serializeScene(scene as ProjectSceneDocument & { _id: Types.ObjectId }));
};

export const generateProjectVideo = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const provider = (req.body?.provider as "openai" | "gemini" | undefined) ?? "gemini";
  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });

  if (!scenes.length) throw new HttpError(400, "Scenes are required to generate a video");

  // Placeholder until video rendering pipeline is implemented.
  res.status(501).json({
    error: "Video generation not implemented yet",
    provider,
    projectId: project._id.toString(),
    scenesCount: scenes.length
  });
};
