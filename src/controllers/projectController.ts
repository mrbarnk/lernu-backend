import { Request, Response } from "express";
import { FilterQuery, SortOrder, Types } from "mongoose";
import { Project, ProjectDocument, ProjectStatus, ProjectStyle } from "../models/Project";
import { ProjectScene, ProjectSceneAttrs, ProjectSceneDocument } from "../models/ProjectScene";
import { HttpError } from "../middleware/error";
import {
  AiScene,
  generateScenesForTopic,
  regenerateSceneWithAi,
  generateVideoWithVeo,
  getVeoVideoOperation
} from "../services/projectAiService";
import { recordAiUsage } from "../services/aiUsageService";
import { synthesizeVoice, elevenLabsAvailable } from "../services/voiceService";
import { env } from "../config/env";
import { processPreviewJob } from "../services/previewJobService";

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
  narration?: string;
  captionText?: string;
  timingPlan?: Record<string, unknown>;
  imagePrompt?: string;
  bRollPrompt?: string;
  duration?: number;
  mediaType?: "image" | "video";
  mediaUri?: string;
  mediaTrimStart?: number;
  mediaTrimEnd?: number;
  mediaAnimation?: string;
  createdAt?: Date;
  updatedAt?: Date;
  audioUri?: string;
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
  audioCaption: scene.description,
  narration: scene.narration ?? scene.description,
  captionText: scene.captionText,
  timingPlan: scene.timingPlan,
  imagePrompt: scene.imagePrompt ?? "",
  bRollPrompt: scene.bRollPrompt ?? "",
  duration: scene.duration ?? 5,
  mediaType: scene.mediaType,
  mediaUri: scene.mediaUri,
  mediaTrimStart: scene.mediaTrimStart,
  mediaTrimEnd: scene.mediaTrimEnd,
  mediaAnimation: scene.mediaAnimation,
  audioUri: scene.audioUri,
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
  videoUri: project.videoUri,
  videoProvider: project.videoProvider,
  videoOperationName: project.videoOperationName,
  previewUri: project.previewUri,
  previewStatus: project.previewStatus,
  previewProgress: project.previewProgress,
  previewMessage: project.previewMessage,
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

const pickMediaAnimation = (mediaType?: "image" | "video", mediaAnimation?: string) =>
  mediaAnimation ?? (mediaType === "image" ? `pan-zoom-${Math.floor(Math.random() * 1_000_000)}` : undefined);

const normalizeInputScenes = (scenes: unknown[]) => {
  if (!Array.isArray(scenes)) return [] as ScenePayload[];
  const maxScenes = 50;
  return scenes
    .slice(0, maxScenes)
    .map((scene, idx) => {
      const audioCaption =
        typeof (scene as any)?.audioCaption === "string"
          ? (scene as any).audioCaption.trim().slice(0, 2000)
          : undefined;
      const narration =
        typeof (scene as any)?.narration === "string"
          ? (scene as any).narration.trim().slice(0, 2000)
          : audioCaption;
      const description =
        typeof (scene as any)?.description === "string"
          ? (scene as any).description.trim().slice(0, 2000)
          : narration ?? audioCaption ?? "";
      if (!description) return null;
      const captionText =
        typeof (scene as any)?.captionText === "string"
          ? (scene as any).captionText.trim().slice(0, 2000)
          : undefined;
      const timingPlan =
        typeof (scene as any)?.timingPlan === "object" && scene?.timingPlan !== null
          ? (scene as any).timingPlan
          : undefined;
      const imagePrompt =
        typeof (scene as any)?.imagePrompt === "string"
          ? (scene as any).imagePrompt.trim().slice(0, 1000)
          : undefined;
      const bRollPrompt =
        typeof (scene as any)?.bRollPrompt === "string"
          ? (scene as any).bRollPrompt.trim().slice(0, 1000)
          : undefined;
      const mediaType =
        (scene as any)?.mediaType === "image" || (scene as any)?.mediaType === "video"
          ? ((scene as any).mediaType as "image" | "video")
          : undefined;
      const mediaUri =
        typeof (scene as any)?.mediaUri === "string"
          ? (scene as any).mediaUri.trim().slice(0, 2000)
          : undefined;
      const mediaTrimStart =
        typeof (scene as any)?.mediaTrimStart === "number" && (scene as any).mediaTrimStart >= 0
          ? (scene as any).mediaTrimStart
          : undefined;
      const mediaTrimEnd =
        typeof (scene as any)?.mediaTrimEnd === "number" && (scene as any).mediaTrimEnd >= 0
          ? (scene as any).mediaTrimEnd
          : undefined;
      const mediaAnimation =
        typeof (scene as any)?.mediaAnimation === "string"
          ? (scene as any).mediaAnimation.trim().slice(0, 200)
          : undefined;
      const resolvedMediaAnimation = pickMediaAnimation(mediaType, mediaAnimation);
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
        narration,
        captionText,
        timingPlan,
        imagePrompt,
        bRollPrompt,
        duration,
        mediaType,
        mediaUri,
        mediaTrimStart,
        mediaTrimEnd,
        mediaAnimation: resolvedMediaAnimation
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

  const targetSceneCount = sceneCount;

  let generatedScenes: AiScene[] = [];
  let refinedScriptUsed: string | undefined;
  const sceneProvider = provider ?? "gemini";
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
      provider: sceneProvider,
      refine
    });
    generatedScenes = generationResult.scenes;
    refinedScriptUsed = generationResult.refinedScript ?? generationResult.scriptUsed ?? scriptText;
    await recordAiUsage({
      userId: req.user._id,
      action: "project:create:generate-scenes",
      usage: generationResult.usage,
      metadata: { projectTitle: title, provider: sceneProvider }
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
    narration: scene.narration ?? scene.description,
    captionText: scene.captionText,
    timingPlan: scene.timingPlan,
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
        narration: scene.narration ?? scene.description,
        captionText: scene.captionText,
        timingPlan: scene.timingPlan,
        imagePrompt: scene.imagePrompt,
        bRollPrompt: scene.bRollPrompt,
        duration: scene.duration,
        mediaType: scene.mediaType,
        mediaUri: scene.mediaUri,
        mediaTrimStart: scene.mediaTrimStart,
        mediaTrimEnd: scene.mediaTrimEnd,
        mediaAnimation: scene.mediaAnimation
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
  const {
    description,
    narration,
    captionText,
    timingPlan,
    imagePrompt,
    bRollPrompt,
    duration,
    position,
    mediaType,
    mediaUri,
    mediaTrimStart,
    mediaTrimEnd,
    mediaAnimation
  } = req.body as {
    description: string;
    narration?: string;
    captionText?: string;
    timingPlan?: Record<string, unknown>;
    imagePrompt?: string;
    bRollPrompt?: string;
    duration?: number;
    position?: number;
    mediaType?: "image" | "video";
    mediaUri?: string;
    mediaTrimStart?: number;
    mediaTrimEnd?: number;
    mediaAnimation?: string;
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

  const resolvedMediaAnimation = pickMediaAnimation(mediaType, mediaAnimation);

  const scene = await ProjectScene.create({
    projectId: project._id,
    sceneNumber: targetPosition,
    description,
    narration: narration ?? description,
    captionText,
    timingPlan,
    imagePrompt,
    bRollPrompt,
    duration: duration ?? 5,
    mediaType,
    mediaUri,
    mediaTrimStart,
    mediaTrimEnd,
    mediaAnimation: resolvedMediaAnimation
  });

  res.status(201).json(serializeScene(scene as ProjectSceneDocument & { _id: Types.ObjectId }));
};

export const updateScene = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  ensureObjectId(req.params.sceneId, "Invalid scene id");

  const scene = await ProjectScene.findOne({ _id: req.params.sceneId, projectId: project._id });
  if (!scene) throw new HttpError(404, "Scene not found");

  const {
    description,
    narration,
    captionText,
    timingPlan,
    imagePrompt,
    bRollPrompt,
    duration,
    mediaType,
    mediaUri,
    mediaTrimStart,
    mediaTrimEnd,
    mediaAnimation
  } = req.body as {
    description?: string;
    narration?: string;
    captionText?: string;
    timingPlan?: Record<string, unknown>;
    imagePrompt?: string;
    bRollPrompt?: string;
    duration?: number;
    mediaType?: "image" | "video";
    mediaUri?: string;
    mediaTrimStart?: number;
    mediaTrimEnd?: number;
    mediaAnimation?: string;
  };

  if (description !== undefined) scene.description = description;
  if (narration !== undefined) scene.narration = narration;
  if (captionText !== undefined) scene.captionText = captionText;
  if (timingPlan !== undefined) scene.timingPlan = timingPlan;
  if (imagePrompt !== undefined) scene.imagePrompt = imagePrompt;
  if (bRollPrompt !== undefined) scene.bRollPrompt = bRollPrompt;
  if (duration !== undefined) scene.duration = duration;
  if (mediaType !== undefined) scene.mediaType = mediaType;
  if (mediaUri !== undefined) scene.mediaUri = mediaUri;
  if (mediaTrimStart !== undefined) scene.mediaTrimStart = mediaTrimStart;
  if (mediaTrimEnd !== undefined) scene.mediaTrimEnd = mediaTrimEnd;
  const resolvedMediaAnimation =
    mediaAnimation !== undefined || (!scene.mediaAnimation && (mediaType ?? scene.mediaType) === "image")
      ? pickMediaAnimation((mediaType ?? scene.mediaType) as "image" | "video" | undefined, mediaAnimation)
      : undefined;
  if (resolvedMediaAnimation !== undefined) scene.mediaAnimation = resolvedMediaAnimation;

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
  const { topic: rawTopic, sceneCount, script, style, provider, refine, createProject } = req.body as {
    topic?: string;
    sceneCount?: number;
    script?: string;
    style?: ProjectStyle;
    provider?: "openai" | "gemini";
    refine?: boolean;
    createProject?: boolean;
  };

  const scriptText = typeof script === "string" ? script : undefined;
  if (!scriptText) throw new HttpError(400, "Script is required");
  const topic = rawTopic ?? deriveTopicFromScript(scriptText);
  if (!topic) throw new HttpError(400, "Script is required to derive a topic");
  const targetSceneCount = sceneCount;

  enforceAiRateLimit(
    `${req.user._id.toString()}:generate`,
    10,
    "Too many AI scene generations. Try again later."
  );

  const sceneProvider = provider ?? "gemini";
  const generationResult = await generateScenesForTopic({
    topic,
    sceneCount: targetSceneCount,
    script: scriptText,
    style,
    // provider: sceneProvider,
    refine
  });
  const scenes = generationResult.scenes;
  const totalDuration = scenes.reduce((acc, scene) => acc + (scene.duration ?? 0), 0);
  const averageSceneDuration = scenes.length ? totalDuration / scenes.length : 0;

  let projectId: string | undefined;
  if (createProject) {
    const project = await Project.create({
      userId: req.user._id,
      title: topic,
      topic,
      script: scriptText,
      refinedScript: generationResult.refinedScript ?? generationResult.scriptUsed ?? scriptText,
      style,
      status: "in-progress"
    });

    const scenesToInsert = scenes.map((scene, idx) => ({
      projectId: project._id,
      sceneNumber: scene.sceneNumber ?? idx + 1,
      description: scene.description,
      narration: scene.narration ?? scene.description,
      captionText: scene.captionText,
      timingPlan: scene.timingPlan,
      imagePrompt: scene.imagePrompt,
      bRollPrompt: scene.bRollPrompt,
      duration: scene.duration
    }));

    if (scenesToInsert.length) {
      await ProjectScene.insertMany(scenesToInsert);
    }

    projectId = project._id.toString();
  }

  await recordAiUsage({
    userId: req.user._id,
    action: "project:generate-scenes",
    usage: generationResult.usage,
    metadata: { topic, provider: sceneProvider }
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
    refinedScript: generationResult.refinedScript,
    ...(projectId ? { projectId } : {})
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
  scene.narration = regenerated.scene.narration ?? regenerated.scene.description;
  if (regenerated.scene.captionText !== undefined) scene.captionText = regenerated.scene.captionText;
  if (regenerated.scene.timingPlan !== undefined) scene.timingPlan = regenerated.scene.timingPlan;
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

export const generateSceneAudio = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  ensureObjectId(req.params.sceneId, "Invalid scene id");

  const scene = await ProjectScene.findOne({ _id: req.params.sceneId, projectId: project._id });
  if (!scene) throw new HttpError(404, "Scene not found");
  if (!elevenLabsAvailable()) throw new HttpError(500, "ElevenLabs API key is not configured");

  const { voiceId, modelId } = req.body as { voiceId?: string; modelId?: string };
  const text = scene.narration || scene.description;
  if (!text) throw new HttpError(400, "Scene narration is empty");

  const audio = await synthesizeVoice({ text, voiceId, modelId });
  scene.audioUri = audio.audioDataUri;
  await scene.save();

  res.json({
    audioUri: scene.audioUri,
    scene: serializeScene(scene as ProjectSceneDocument & { _id: Types.ObjectId })
  });
};

export const generateProjectVideo = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const provider = (req.body?.provider as "openai" | "gemini" | "veo" | undefined) ?? "veo";
  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });

  if (project.videoUri) {
    return res.json({
      status: "completed",
      provider: project.videoProvider ?? provider,
      projectId: project._id.toString(),
      scenesCount: scenes.length,
      operationName: project.videoOperationName ?? null,
      videos: [{ uri: project.videoUri }]
    });
  }

  if (project.videoOperationName) {
    return res.status(202).json({
      status: "processing",
      provider: project.videoProvider ?? provider,
      projectId: project._id.toString(),
      scenesCount: scenes.length,
      operationName: project.videoOperationName,
      videos: []
    });
  }

  if (!scenes.length) throw new HttpError(400, "Scenes are required to generate a video");

  if (provider !== "veo") {
    throw new HttpError(400, "Only provider 'veo' is supported for video generation");
  }

  const plannedScenes: AiScene[] = scenes.map((scene, idx) => ({
    sceneNumber: scene.sceneNumber ?? idx + 1,
    description: scene.narration ?? scene.description,
    narration: scene.narration ?? scene.description,
    captionText: scene.captionText,
    imagePrompt: scene.imagePrompt ?? "",
    bRollPrompt: scene.bRollPrompt ?? "",
    timingPlan: (scene as any)?.timingPlan as any,
    duration: scene.duration ?? 2
  }));

  const videoResult = await generateVideoWithVeo({
    topic: project.topic,
    scenes: plannedScenes,
    style: project.style ?? "cinematic"
  });

  const hasVideo = (videoResult.videos?.length ?? 0) > 0;
  project.videoOperationName = videoResult.operationName ?? project.videoOperationName;
  if (hasVideo) {
    project.videoUri = videoResult.videos?.[0]?.uri ?? undefined;
    project.videoProvider = provider;
  }
  await project.save();
  res.status(hasVideo ? 200 : 202).json({
    status: hasVideo ? "completed" : "processing",
    provider,
    projectId: project._id.toString(),
    scenesCount: plannedScenes.length,
    operationName: videoResult.operationName ?? project.videoOperationName ?? null,
    videos: videoResult.videos ?? []
  });
};

export const getProjectVideoStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const operationName =
    (req.query.operationName as string | undefined) ||
    project.videoOperationName ||
    undefined;

  if (!operationName) {
    return res.json({
      status: project.videoUri ? "completed" : "pending",
      videoUri: project.videoUri ?? null,
      provider: project.videoProvider ?? null
    });
  }

  const op = await getVeoVideoOperation(operationName);
  const hasVideo = (op.videos?.length ?? 0) > 0;

  if (hasVideo) {
    project.videoUri = op.videos?.[0]?.uri ?? project.videoUri;
    project.videoProvider = "veo";
    project.videoOperationName = op.operationName ?? project.videoOperationName;
    await project.save();
  }

  res.json({
    status: hasVideo ? "completed" : "processing",
    videoUri: project.videoUri ?? op.videos?.[0]?.uri ?? null,
    provider: "veo",
    operationName: op.operationName
  });
};

export const getProjectPreviewStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);

  res.json({
    status: project.previewStatus ?? "pending",
    previewUri: project.previewUri ?? null,
    projectId: project._id.toString(),
    progress: project.previewProgress ?? 0,
    message: project.previewMessage ?? null
  });
};

export const generateProjectPreview = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const project = await ensureProjectOwned(req.params.projectId, req.user._id);
  const provider = (req.body?.provider as "openai" | "gemini" | "veo" | undefined) ?? "veo";
  const quality = (req.body?.quality as "sd" | "hd" | undefined) ?? "sd";

  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });
  if (!scenes.length) throw new HttpError(400, "Scenes are required to generate a preview");

  project.previewStatus = "processing";
  project.previewProgress = 0;
  project.previewMessage = undefined;
  await project.save();

  // Fire and forget background job
  processPreviewJob(project._id.toString()).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Preview job failed", err);
  });

  res.status(202).json({
    status: "processing",
    provider,
    quality,
    projectId: project._id.toString(),
    scenesCount: scenes.length,
    previewUri: project.previewUri ?? null
  });
};
