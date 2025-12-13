import { Request, Response } from "express";
import { HttpError } from "../middleware/error";
import { generateScriptWithAi, generateVideoFromScript } from "../services/projectAiService";
import { VideoGeneration } from "../models/VideoGeneration";
import { parsePagination, buildCursorFilter, getNextCursor } from "../utils/pagination";

export const generateScript = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { prompt, language, duration } = req.body as {
    prompt: string;
    language: string;
    duration: string;
  };

  const result = await generateScriptWithAi({ prompt, language, duration });
  res.json({ script: result.script, usage: result.usage });
};

export const generateVideoFromScriptHandler = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { script, style } = req.body as { script: string; style?: any };

  const result = await generateVideoFromScript({ script, style });
  const video = await VideoGeneration.create({
    userId: req.user._id,
    script,
    style,
    topic: result.payload.topic,
    provider: result.payload.provider,
    sequences: result.payload.sequences,
    videoUri: result.payload.videoUri ?? undefined
  });

  res
    .status(result.statusCode ?? 200)
    .json({ id: video._id.toString(), ...result.payload });
};

export const listVideoGenerations = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { limit, cursor } = parsePagination(req.query, 10, 50);

  const videos = await VideoGeneration.find({
    userId: req.user._id,
    ...buildCursorFilter(cursor)
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    items: videos.map((v) => ({
      id: v._id.toString(),
      script: v.script,
      style: v.style,
      topic: v.topic,
      provider: v.provider,
      sequences: v.sequences,
      videoUri: v.videoUri ?? null,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt
    })),
    nextCursor: getNextCursor(videos as any, limit)
  });
};
