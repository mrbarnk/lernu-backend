import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuid } from "uuid";
import { Project } from "../models/Project";
import { ProjectScene } from "../models/ProjectScene";
import { uploadBufferToR2 } from "../utils/storage";

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 540;
const ENCODE_PRESET = "ultrafast";
const ENCODE_CRF = "28";
const SEGMENT_CACHE_DIR = path.join(os.tmpdir(), "preview-cache");
const DOWNLOAD_DIR = path.join(os.tmpdir(), "preview-downloads");
ensureDir(SEGMENT_CACHE_DIR);
ensureDir(DOWNLOAD_DIR);

const writeTempFromDataUri = (dataUri: string, ext: string) => {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUri);
  if (!match) return null;
  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-"));
  ensureDir(tmpDir);
  const filePath = path.join(tmpDir, `${uuid()}${ext}`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, mime };
};

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const message = `ffmpeg exited with code ${code}. args=${args.join(" ")} stderr=${stderr.trim()}`;
        reject(new Error(message));
      }
    });
  });

const downloadToTemp = async (uri: string, defaultExt = ".bin") => {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext =
    (() => {
      const fromUrl = path.extname(new URL(uri).pathname);
      if (fromUrl) return fromUrl;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("image/png")) return ".png";
      if (ct.includes("image/jpeg")) return ".jpg";
      if (ct.includes("video/mp4")) return ".mp4";
      if (ct.includes("audio/mpeg")) return ".mp3";
      if (ct.includes("audio/wav")) return ".wav";
      return defaultExt;
    })();
  const filePath = path.join(DOWNLOAD_DIR, `${uuid()}${ext}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

const resolveMediaPath = async (mediaUri?: string, mediaType?: "image" | "video") => {
  if (!mediaUri) return undefined;
  if (mediaUri.startsWith("data:")) {
    const ext = mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".bin";
    const written = writeTempFromDataUri(mediaUri, ext);
    return written?.filePath;
  }
  if (mediaUri.startsWith("http://") || mediaUri.startsWith("https://")) {
    return downloadToTemp(mediaUri, mediaType === "image" ? ".png" : ".mp4");
  }
  return mediaUri;
};

const resolveAudioPath = async (audioUri?: string) => {
  if (!audioUri) return undefined;
  if (audioUri.startsWith("data:")) {
    const written = writeTempFromDataUri(audioUri, ".mp3") ?? writeTempFromDataUri(audioUri, ".wav");
    return written?.filePath;
  }
  if (audioUri.startsWith("http://") || audioUri.startsWith("https://")) {
    return downloadToTemp(audioUri, ".mp3");
  }
  return audioUri;
};

const hashScene = (scene: {
  sceneNumber: number;
  duration: number;
  mediaUri?: string;
  mediaType?: "image" | "video";
  audioUri?: string;
}) => {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify({ ...scene, preset: ENCODE_PRESET, crf: ENCODE_CRF, w: PREVIEW_WIDTH, h: PREVIEW_HEIGHT }));
  return h.digest("hex");
};

const makeSegment = async (params: {
  sceneNumber: number;
  duration: number;
  mediaPath?: string;
  mediaType?: "image" | "video";
  audioPath?: string;
  outputPath?: string;
}) => {
  const { duration, mediaPath, mediaType, audioPath, outputPath } = params;
  const segmentPath =
    outputPath ??
    (() => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-seg-"));
      ensureDir(tmpDir);
      return path.join(tmpDir, `seg-${params.sceneNumber}.mp4`);
    })();
  const inputs: string[] = [];
  const filters: string[] = [];

  const hasMedia = Boolean(mediaPath);
  const hasAudio = Boolean(audioPath);
  let audioInputIndex = -1;

  if (hasMedia) {
    if (mediaType === "image") {
      inputs.push("-loop", "1", "-i", mediaPath as string);
      filters.push(
        `[0:v]scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0]`
      );
    } else {
      inputs.push("-i", mediaPath as string);
      filters.push(
        `[0:v]scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0]`
      );
    }
  } else {
    inputs.push("-f", "lavfi", "-i", `color=c=black:s=${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}:d=${duration}`);
    filters.push(`[0:v]format=yuv420p[v0]`);
  }

  if (hasAudio && audioPath) {
    inputs.push("-i", audioPath);
    audioInputIndex = hasMedia ? 1 : 1;
  }

  const ffmpegArgs = ["-y", ...inputs];

  ffmpegArgs.push("-map", "[v0]");
  if (audioInputIndex >= 0) {
    ffmpegArgs.push("-map", `${audioInputIndex}:a`);
  }
  ffmpegArgs.push("-t", `${duration}`, "-shortest", "-c:v", "libx264", "-preset", ENCODE_PRESET, "-crf", ENCODE_CRF);
  ffmpegArgs.push("-c:a", "aac", "-movflags", "+faststart", "-filter_complex", filters.join(";"));
  ffmpegArgs.push(segmentPath);

  await runFfmpeg(ffmpegArgs);
  return segmentPath;
};

const concatSegments = async (segments: string[]) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-concat-"));
  ensureDir(tmpDir);
  const listFile = path.join(tmpDir, "files.txt");
  fs.writeFileSync(listFile, segments.map((seg) => `file '${seg.replace(/'/g, "'\\''")}'`).join("\n"));

  const outputPath = path.join(tmpDir, "preview.mp4");
  try {
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outputPath
    ]);
    return outputPath;
  } catch {
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath
    ]);
    return outputPath;
  }
};

export const renderPreviewBuffer = async (projectId: string) => {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");

  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });
  if (!scenes.length) throw new Error("No scenes to render");

  const tasks = await Promise.all(
    scenes.map(async (scene, idx) => {
      const duration = scene.duration ?? 5;
      const mediaPath = await resolveMediaPath(scene.mediaUri, scene.mediaType as any);
      const audioPath = await resolveAudioPath(scene.audioUri ?? undefined);
      const hash = hashScene({
        sceneNumber: scene.sceneNumber ?? idx + 1,
        duration,
        mediaUri: mediaPath ?? "none",
        mediaType: scene.mediaType as any,
        audioUri: audioPath ?? "none"
      });
      const cached = path.join(SEGMENT_CACHE_DIR, `${hash}.mp4`);
      return {
        sceneNumber: scene.sceneNumber ?? idx + 1,
        duration,
        mediaPath,
        mediaType: scene.mediaType as any,
        audioPath,
        cached
      };
    })
  );

  const segments: string[] = [];
  const concurrency = 4;
  const queue = tasks.slice();
  const runNext = async (): Promise<void> => {
    const task = queue.shift();
    if (!task) return;
    if (fs.existsSync(task.cached)) {
      segments.push(task.cached);
      return runNext();
    }
    const segment = await makeSegment({
      sceneNumber: task.sceneNumber,
      duration: task.duration,
      mediaPath: task.mediaPath,
      mediaType: task.mediaType,
      audioPath: task.audioPath,
      outputPath: task.cached
    });
    segments.push(segment);
    return runNext();
  };

  const runners = Array.from({ length: concurrency }, () => runNext());
  await Promise.all(runners);

  const concatenated = await concatSegments(segments);
  const buffer = fs.readFileSync(concatenated);
  return {
    buffer,
    mime: "video/mp4",
    filename: "preview.mp4"
  };
};

export const processPreviewJob = async (projectId: string) => {
  const project = await Project.findById(projectId);
  if (!project) return;

  const scenes = await ProjectScene.find({ projectId: project._id }).sort({ sceneNumber: 1 });
  if (!scenes.length) {
    project.previewStatus = "failed";
    project.previewMessage = "No scenes to render";
    await project.save();
    return;
  }

  try {
    project.previewStatus = "processing";
    project.previewProgress = 0;
    project.previewMessage = undefined;
    await project.save();

    const tasks = await Promise.all(
      scenes.map(async (scene, idx) => {
        const duration = scene.duration ?? 5;
        const mediaPath = await resolveMediaPath(scene.mediaUri, scene.mediaType as any);
        const audioPath = await resolveAudioPath(scene.audioUri ?? undefined);
        const hash = hashScene({
          sceneNumber: scene.sceneNumber ?? idx + 1,
          duration,
          mediaUri: mediaPath ?? "none",
          mediaType: scene.mediaType as any,
          audioUri: audioPath ?? "none"
        });
        const cached = path.join(SEGMENT_CACHE_DIR, `${hash}.mp4`);
        return {
          sceneNumber: scene.sceneNumber ?? idx + 1,
          duration,
          mediaPath,
          mediaType: scene.mediaType as any,
          audioPath,
          cached
        };
      })
    );

    const segments: string[] = [];
    const concurrency = 4;
    const queue = tasks.slice();
    const runNext = async (): Promise<void> => {
      const task = queue.shift();
      if (!task) return;
      if (fs.existsSync(task.cached)) {
        segments.push(task.cached);
      } else {
        const segment = await makeSegment({
          sceneNumber: task.sceneNumber,
          duration: task.duration,
          mediaPath: task.mediaPath,
          mediaType: task.mediaType,
          audioPath: task.audioPath,
          outputPath: task.cached
        });
        segments.push(segment);
      }
      project.previewProgress = Math.round((segments.length / scenes.length) * 90);
      await project.save();
      return runNext();
    };

    const runners = Array.from({ length: concurrency }, () => runNext());
    await Promise.all(runners);

    const concatenated = await concatSegments(segments);
    const buffer = fs.readFileSync(concatenated);
    const uploaded = await uploadBufferToR2({
      prefix: "previews",
      buffer,
      originalName: "preview.mp4",
      contentType: "video/mp4"
    });

    project.previewUri = uploaded;
    project.previewStatus = "completed";
    project.previewProgress = 100;
    project.previewMessage = undefined;
    await project.save();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("Preview job failed", err);
    project.previewStatus = "failed";
    project.previewMessage = err?.message || "Preview failed";
    await project.save();
  }
};
