import { Request, Response } from "express";
import { HttpError } from "../middleware/error";
import {
  generateScriptWithAi,
  generateVideoFromScript,
  getCategoryInstruction
} from "../services/projectAiService";
import { fetchElevenLabsVoices, fetchVoicePreviewUrl } from "../services/voiceService";
import { VideoGeneration } from "../models/VideoGeneration";
import { processVideoGenerationJob, getVideoGenerationStatus } from "../services/videoJobService";
import { parsePagination, buildCursorFilter, getNextCursor } from "../utils/pagination";
import { consumeUserCredits, refundUserCredits } from "../services/creditService";
import { recordScriptGeneration } from "../services/aiScriptLoggingService";

const VOICE_OPTIONS = [
  { id: "narrator-deep", name: "Deep Narrator", gender: "male", style: "Cinematic & dramatic", previewUrl: null },
  { id: "narrator-warm", name: "Warm Narrator", gender: "male", style: "Friendly & engaging", previewUrl: null },
  { id: "storyteller-f", name: "Sofia", gender: "female", style: "Soft & captivating", previewUrl: null },
  { id: "storyteller-m", name: "Marcus", gender: "male", style: "Authoritative & clear", previewUrl: null },
  { id: "dramatic-f", name: "Elena", gender: "female", style: "Expressive & emotional", previewUrl: null },
  { id: "mysterious", name: "Shadow", gender: "male", style: "Dark & mysterious", previewUrl: null },
  { id: "upbeat-f", name: "Lily", gender: "female", style: "Bright & energetic", previewUrl: null },
  { id: "classic-m", name: "James", gender: "male", style: "Classic documentary", previewUrl: null }
] as const;

const MUSIC_LIBRARY = [
  { id: "none", name: "No Music", tags: ["None"], duration: "-" },
  { id: "christmas-bells", name: "🎄 Christmas Bells", tags: ["Holiday", "Festive", "Joyful"], duration: "2:30" },
  { id: "winter-wonder", name: "❄️ Winter Wonderland", tags: ["Holiday", "Peaceful", "Magical"], duration: "3:15" },
  { id: "choristes", name: "Choristes", tags: ["Choir", "Classical", "Emotional"], duration: "2:45" },
  { id: "fur-elise", name: "Für Elise", tags: ["Classical", "Piano"], duration: "3:00" },
  { id: "villain", name: "Making a Villain", tags: ["Dark", "Dramatic"], duration: "2:30" },
  { id: "strings", name: "String Arpeggios", tags: ["Classical", "Elegant"], duration: "2:15" },
  { id: "movie-trailer", name: "Movie Trailer", tags: ["Cinematic", "Epic"], duration: "2:00" },
  { id: "ghost", name: "Ghost", tags: ["Ambient", "Mysterious"], duration: "3:30" },
  { id: "dark-synths", name: "Dark Synths", tags: ["Synthwave", "Horror"], duration: "2:45" },
  { id: "spooky", name: "Spooky Quiet", tags: ["Scary", "Horror"], duration: "3:00" },
  { id: "phonk", name: "Phonk", tags: ["Phonk", "Hardstyle"], duration: "2:30" },
  { id: "comedy", name: "Comedy", tags: ["Funny", "Light"], duration: "2:00" },
  { id: "eternal-strings", name: "Eternal Strings", tags: ["Classical", "Emotional"], duration: "3:45" }
] as const;

const FONT_LIBRARY = [
  { id: "montserrat", name: "Montserrat", family: "'Montserrat', 'Helvetica Neue', Arial, sans-serif" },
  { id: "inter", name: "Inter", family: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  { id: "dm-sans", name: "DM Sans", family: "'DM Sans', 'Helvetica Neue', Arial, sans-serif" },
  { id: "lato", name: "Lato", family: "'Lato', 'Helvetica Neue', Arial, sans-serif" },
  { id: "poppins", name: "Poppins", family: "'Poppins', 'Helvetica Neue', Arial, sans-serif" },
  { id: "playfair", name: "Playfair Display", family: "'Playfair Display', Georgia, serif" },
  { id: "merriweather", name: "Merriweather", family: "'Merriweather', Georgia, serif" },
  { id: "cinzel", name: "Cinzel", family: "'Cinzel', 'Times New Roman', serif" }
] as const;

const RANDOM_TOPIC_LIBRARY: Record<string, string[]> = {
  "scary-stories": [
    "The watcher in the woods that no one sees twice",
    "The elevator that only moves at 3:33 AM",
    "The voicemail from tomorrow night",
    "The town that erased one day from its calendar",
    "The bridge that hums back when you whistle"
  ],
  history: [
    "The forgotten war fought over bird poop",
    "How a volcano in 1815 invented the bicycle",
    "The librarian who saved Timbuktu's manuscripts",
    "The heist that stole the Mona Lisa for two years",
    "The ghost army of World War II that wasn't a ghost"
  ],
  science: [
    "How whales learned to echolocate in the dark ocean",
    "The mushroom that can clean up oil spills",
    "The black hole that sings a B-flat 57 octaves below middle C",
    "The particle that broke the speed of light—until it didn't",
    "The jellyfish that may live forever"
  ],
  tech: [
    "The USB stick that took down a nuclear program",
    "The satellite that crashed twice and kept working",
    "The teenager who mapped every ship at sea from his bedroom",
    "The AI that saved a city from a blackout",
    "The floppy disk that delayed a rocket launch"
  ],
  mysteries: [
    "The missing lighthouse keepers of Eilean Mor",
    "The radio signal that repeats every 18 minutes",
    "The book written in a language no one can read",
    "The plane that vanished and landed—twelve years later",
    "The desert stones that move when no one watches"
  ]
};

const FALLBACK_TOPICS = [
  "The village that disappeared overnight",
  "The map that rewrote world borders",
  "The ocean that glows without light",
  "The astronaut stranded in orbit for 311 days",
  "The abandoned island ruled by rabbits"
];

const toLabel = (value?: string) => {
  if (!value) return undefined;
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const pickTopicForCategory = (topicCategory?: string) => {
  const key = topicCategory?.toLowerCase() ?? "";
  const library = RANDOM_TOPIC_LIBRARY[key];
  const base = library?.length ? pickRandom(library) : pickRandom(FALLBACK_TOPICS);
  if (topicCategory && !library?.length) {
    return `${toLabel(topicCategory)}: ${base}`;
  }
  return base;
};

const buildRandomScriptPrompt = (params: {
  topicCategory?: string;
  format?: string;
  duration?: string;
}) => {
  const topic = pickTopicForCategory(params.topicCategory);
  const categoryLabel = toLabel(params.topicCategory) ?? "General interest";
  const formatLabel = toLabel(params.format) ?? "Storytelling";
  const parts = [
    `Write a ${formatLabel.toLowerCase()} short-form video script about "${topic}".`,
    `Category: ${categoryLabel}.`,
    "Keep narration faceless, punchy, with blank lines between paragraphs, and under ~1,200 words."
  ];
  if (params.duration) parts.push(`Target runtime hint: ${params.duration}.`);
  return { prompt: parts.join(" "), topic, format: formatLabel };
};

export const generateScript = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const {
    prompt,
    language = "en",
    duration = "60s",
    topicCategory,
    format,
    model
  } = req.body as {
    prompt?: string;
    language?: string;
    duration?: string;
    topicCategory?: string;
    format?: string;
    model?: string;
  };

  const hasPrompt = Boolean(prompt);
  const hasRandomInputs = Boolean(topicCategory && format);
  if (!hasPrompt && !hasRandomInputs) {
    throw new HttpError(400, "Provide either a prompt or both topicCategory and format");
  }

  let aiPrompt = prompt?.trim();
  let resolvedTopic: string | undefined;
  let resolvedFormat: string | undefined;

  if (!aiPrompt) {
    const plan = buildRandomScriptPrompt({ topicCategory, format, duration });
    aiPrompt = plan.prompt;
    resolvedTopic = plan.topic;
    resolvedFormat = plan.format;
  } else if (format || topicCategory) {
    const formatLabel = toLabel(format);
    const categoryLabel = toLabel(topicCategory);
    const contextParts = [
      formatLabel ? `Format: ${formatLabel}.` : undefined,
      categoryLabel ? `Category: ${categoryLabel}.` : undefined,
      "Keep paragraphs separated by blank lines."
    ].filter(Boolean);
    aiPrompt = `${aiPrompt}\n\n${contextParts.join(" ")}`.trim();
    resolvedFormat = formatLabel ?? undefined;
  }

  if (!aiPrompt) throw new HttpError(400, "Prompt is required");
  const modelId = hasRandomInputs ? undefined : model?.trim();

  let creditsRemaining: number | undefined;
  let creditsConsumed = false;

  try {
    creditsRemaining = await consumeUserCredits(req.user._id, 1);
    creditsConsumed = true;

    const result = await generateScriptWithAi({
      prompt: aiPrompt,
      language: language || "en",
      duration: duration || "60s",
      categoryInstructions:
        getCategoryInstruction(topicCategory) ||
        (modelId === "bible-knowledge" && !topicCategory
          ? getCategoryInstruction("bible-stories")
          : undefined),
      modelId
    });

    const script = result.script?.trim();
    if (!script) throw new HttpError(500, "Failed to generate script with AI");

    await recordScriptGeneration({
      userId: req.user._id,
      prompt: aiPrompt,
      script,
      topic: resolvedTopic,
      topicCategory,
      format,
      resolvedFormat,
      duration,
      language,
      usage: result.usage,
      modelId
    });

    res.json({
      script,
      ...(resolvedTopic ? { topic: resolvedTopic } : {}),
      ...(resolvedFormat ? { format: resolvedFormat } : {}),
      usage: result.usage,
      model: modelId,
      creditsRemaining
    });
  } catch (err) {
    if (creditsConsumed) {
      await refundUserCredits(req.user._id, 1);
    }
    throw err;
  }
};

export const listVoiceOptions = async (_req: Request, res: Response) => {
  const apiVoices = await fetchElevenLabsVoices();
  if (apiVoices.length) {
    return res.json({ voices: apiVoices });
  }
  // Fallback to static UI voices (no preview without API voice ids)
  res.json({ voices: VOICE_OPTIONS });
};

export const getVoicePreview = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { id } = req.params;
  const previewUrl = await fetchVoicePreviewUrl(id);
  if (!previewUrl) throw new HttpError(404, "Preview not available");
  res.json({ previewUrl });
};

export const listMusicLibrary = async (_req: Request, res: Response) => {
  res.json({ tracks: MUSIC_LIBRARY });
};

export const listFontLibrary = async (_req: Request, res: Response) => {
  res.json({ fonts: FONT_LIBRARY });
};

export const generateVideoFromScriptHandler = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { script, style, voiceId, musicTrackId, musicVolume } = req.body as {
    script: string;
    style?: any;
    voiceId?: string;
    musicTrackId?: string;
    musicVolume?: number;
  };

  const result = await generateVideoFromScript({ script, style });
  const video = await VideoGeneration.create({
    userId: req.user._id,
    script,
    style,
    voiceId,
    musicTrackId,
    musicVolume,
    topic: result.payload.topic,
    provider: result.payload.provider,
    sequences: result.payload.sequences,
    videoUri: result.payload.videoUri ?? undefined
  });

  await processVideoGenerationJob(video);
  const updated = await VideoGeneration.findById(video._id);

  res.status(result.statusCode ?? 200).json({
    id: video._id.toString(),
    ...(updated
      ? {
          status: updated.status,
          provider: updated.provider,
          operationName: null,
          videoUri: updated.videoUri ?? null,
          topic: updated.topic,
          sequences: updated.sequences
        }
      : result.payload)
  });
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
      voiceId: v.voiceId,
      musicTrackId: v.musicTrackId,
      musicVolume: v.musicVolume,
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

export const processVideoGeneration = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const video = await VideoGeneration.findOne({ _id: req.params.id, userId: req.user._id });
  if (!video) throw new HttpError(404, "Video generation not found");

  if (video.status === "completed" || video.status === "processing") {
    return res.json({ status: video.status, progress: video.progress ?? 0, id: video._id.toString() });
  }

  await processVideoGenerationJob(video);
  const updated = await VideoGeneration.findById(video._id);
  res.json({
    status: updated?.status ?? "pending",
    progress: updated?.progress ?? 0,
    id: video._id.toString()
  });
};

export const videoGenerationStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const video = await VideoGeneration.findOne({ _id: req.params.id, userId: req.user._id });
  if (!video) throw new HttpError(404, "Video generation not found");
  const status = await getVideoGenerationStatus(video);
  res.json(status);
};

