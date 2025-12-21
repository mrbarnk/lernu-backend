import { spawn } from "child_process";
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
    const proc = spawn("ffmpeg", args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

const makeSegment = async (params: {
  sceneNumber: number;
  duration: number;
  mediaUri?: string;
  mediaType?: "image" | "video";
  audioUri?: string;
}) => {
  const { duration, mediaUri, mediaType, audioUri } = params;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-seg-"));
  ensureDir(tmpDir);
  const segmentPath = path.join(tmpDir, `seg-${params.sceneNumber}.mp4`);
  const inputs: string[] = [];
  const filters: string[] = [];

  const hasMedia = Boolean(mediaUri);
  const hasAudio = Boolean(audioUri);
  let audioInputIndex = -1;

  if (hasMedia) {
    if (mediaType === "image") {
      inputs.push("-loop", "1", "-i", mediaUri as string);
      filters.push(
        `[0:v]scale=1280:720:force_original_aspect_ratio=cover,format=yuv420p[v0]`
      );
    } else {
      inputs.push("-i", mediaUri as string);
      filters.push(
        `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0]`
      );
    }
  } else {
    inputs.push("-f", "lavfi", "-i", `color=c=black:s=1280x720:d=${duration}`);
    filters.push(`[0:v]format=yuv420p[v0]`);
  }

  if (hasAudio && audioUri) {
    const audio = writeTempFromDataUri(audioUri, ".mp3") ?? writeTempFromDataUri(audioUri, ".wav");
    if (audio) {
      inputs.push("-i", audio.filePath);
      audioInputIndex = hasMedia ? 1 : 1;
    }
  }

  const ffmpegArgs = ["-y", ...inputs];

  ffmpegArgs.push("-map", "[v0]");
  if (audioInputIndex >= 0) {
    ffmpegArgs.push("-map", `${audioInputIndex}:a`);
  }
  ffmpegArgs.push("-t", `${duration}`, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23");
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

    const segments: string[] = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i];
      const duration = scene.duration ?? 5;
      const segment = await makeSegment({
        sceneNumber: scene.sceneNumber ?? i + 1,
        duration,
        mediaUri: scene.mediaUri,
        mediaType: scene.mediaType as any,
        audioUri: scene.audioUri
      });
      segments.push(segment);
      project.previewProgress = Math.round(((i + 1) / scenes.length) * 90);
      await project.save();
    }

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
