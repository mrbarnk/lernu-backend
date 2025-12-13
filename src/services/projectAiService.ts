import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { HttpError } from "../middleware/error";
import { ProjectStyle } from "../models/Project";
import { AiUsageMetrics } from "./aiUsageService";

export type AiProvider = "openai" | "gemini" | "veo";
export interface AiScene {
  sceneNumber: number;
  description: string;
  imagePrompt: string;
  bRollPrompt: string;
  duration: number;
}

const client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
const geminiClient = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;
const defaultModel = env.openAiModel ?? "gpt-4o-mini";
const defaultGeminiModel = env.geminiModel ?? "gemini-1.5-flash";
const defaultProvider: AiProvider =
  env.aiProvider === "gemini" || env.aiProvider === "openai" || env.aiProvider === "veo"
    ? (env.aiProvider as AiProvider)
    : "openai";
const defaultStyle: ProjectStyle = "cinematic";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ChatUsage = OpenAI.Chat.Completions.ChatCompletion["usage"] | null | undefined;

const mapUsage = (usage: ChatUsage, model: string): AiUsageMetrics | undefined => {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    model
  };
};

type GeminiUsage =
  | {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  }
  | undefined;

const mapGeminiUsage = (usage: GeminiUsage, model: string): AiUsageMetrics | undefined => {
  if (!usage) return undefined;
  return {
    promptTokens: usage.promptTokenCount ?? 0,
    completionTokens: usage.candidatesTokenCount ?? 0,
    totalTokens:
      usage.totalTokenCount ??
      (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
    model
  };
};

const styleGuidance: Record<ProjectStyle, string> = {
  "4k-realistic": "4K ultra-realistic visuals with crisp detail and lifelike textures",
  clay: "stop-motion clay characters and props, soft lighting, handcrafted feel",
  cinematic: "cinematic lighting, shallow depth of field, dramatic framing",
  brick: "built from LEGO/brick-style pieces, colorful studs and blocky forms",
  grudge: "gritty, moody, high contrast with subtle film grain",
  "comic-book": "inked outlines, halftone shading, bold colors and dynamic angles",
  muppet: "felt textures, puppet-style characters with expressive eyes",
  ghibli: "Studio Ghibli-inspired, painterly backgrounds and gentle lighting",
  playground: "whimsical, toy-like, soft gradients and playful geometry",
  voxel: "3D voxel art, blocky depth, isometric-friendly lighting",
  anime: "anime-style characters, clean lines, vivid color, energetic compositions",
  "pixer-3d": "Pixar-like 3D, soft global illumination, expressive characters"
};

const SYSTEM_PROMPT = `You are an expert video content planner for short, faceless videos.
Break topics into clear, sequential scenes with vivid visual direction and matching b-roll ideas.
Ensure every imagePrompt and bRollPrompt stays consistent with the story's timeline, setting, and emotional arc.
When a topic or script implies a specific era or location (e.g., 1920s Paris), every visual should reflect that period and place.
Avoid referring to on-camera hosts; focus on what the viewer sees. Always answer with JSON only.`;

const SINGLE_SCENE_PROMPT = `You rewrite individual scenes for a faceless video, keeping them concise and visual-first.
Return a JSON object only.`;

const SCRIPT_REFINE_SYSTEM_PROMPT = `You are a viral short-form content strategist.
You reshape rough ideas into high-retention faceless scripts with strong hooks and pattern breaks.
Keep everything voiceover-ready; never mention a host or camera.
Always answer with JSON only.`;

const parseJson = (content: string) => {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

const normalizeScene = (scene: any, index: number): AiScene => {
  const description =
    typeof scene?.description === "string" ? scene.description.trim().slice(0, 2000) : "";
  const imagePrompt =
    typeof scene?.imagePrompt === "string"
      ? scene.imagePrompt.trim().slice(0, 1000)
      : typeof scene?.image_prompt === "string"
        ? scene.image_prompt.trim().slice(0, 1000)
        : "";
  const bRollPrompt =
    typeof scene?.bRollPrompt === "string"
      ? scene.bRollPrompt.trim().slice(0, 1000)
      : typeof scene?.brollPrompt === "string"
        ? scene.brollPrompt.trim().slice(0, 1000)
        : "";

  const rawDuration =
    typeof scene?.duration === "number"
      ? scene.duration
      : Number.isFinite(Number(scene?.duration))
        ? Number(scene?.duration)
        : 5;

  return {
    sceneNumber: index + 1,
    description,
    imagePrompt,
    bRollPrompt,
    duration: clamp(rawDuration || 5, 1, 6)
  };
};

const normalizeScenes = (data: any, targetCount?: number): AiScene[] => {
  const scenesArray = Array.isArray(data?.scenes)
    ? data.scenes
    : Array.isArray(data)
      ? data
      : [];
  if (!scenesArray.length) throw new Error("No scenes returned");
  const limit = targetCount ?? scenesArray.length;
  return scenesArray.slice(0, limit).map((scene: unknown, idx: number) => normalizeScene(scene, idx));
};

const deriveTopicFromScript = (script?: string) => {
  if (!script) return "Untitled";
  const cleaned = script.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 120) : "Untitled";
};

const estimateSceneCountFromScript = (script?: string, fallback = 4) => {
  if (!script) return fallback;
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const estimated = Math.max(1, Math.ceil(words / 45));
  return Math.min(20, estimated);
};

const stringifyScriptPayload = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item, idx) => {
        const rendered = stringifyScriptPayload(item);
        return `${idx + 1}. ${rendered}`;
      })
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${stringifyScriptPayload(val)}`)
      .join("\n");
  }
  if (value === null || value === undefined) return "";
  return String(value);
};

const buildScenesPrompt = (topic: string, sceneCount: number, style: ProjectStyle, script?: string) => {
  const parts = [
    `Create ${sceneCount} short scenes for a faceless video. Topic reference: "${topic}".`,
    "Use the provided script as the primary source and preserve its order and intent.",
    `Visual style: ${styleGuidance[style]}.`,
    "For each scene include: description (1-2 sentences), imagePrompt (cinematic still prompt), bRollPrompt (supporting footage), and duration in seconds.",
    "Each scene/b-roll should be between 1-6 seconds. Keep narration concise, action-oriented, and avoid direct address to camera.",
    "Keep visual prompts aligned with the full storyline (era, location, characters, tone) so shots feel consistent from start to finish.",
    "If the topic or script hints at a historical period or place (e.g., 1920s Paris), explicitly anchor each imagePrompt and bRollPrompt in that era with era-accurate details (fashion, tech, lighting, vehicles, architecture)."
  ];
  if (script) {
    parts.push("Script to split into scenes:");
    parts.push(script);
  }
  parts.push("Return a JSON object with a single key 'scenes' containing the array.");
  return parts.join("\n\n");
};

const buildVeoScenesPrompt = (topic: string, style: ProjectStyle, script?: string) => {
  const parts = [
    "Create short scenes for a faceless video that will be rendered into ~8 seconds total.",
    `Topic reference: "${topic}". Let the model choose the right number of scenes to fit ~8s (usually 3-6 scenes).`,
    "Use the provided script as the primary source and preserve its order and intent.",
    `Visual style: ${styleGuidance[style]}.`,
    "For each scene include: description (voiceover line), imagePrompt (era/place-accurate cinematic still), bRollPrompt (supporting footage for that exact line), and duration in seconds.",
    "Each scene/b-roll should be between 1-4 seconds. Keep narration concise, action-oriented, and avoid direct address to camera.",
    "Keep visual prompts aligned with the full storyline (era, location, characters, tone) so shots feel consistent from start to finish.",
    "If the topic or script hints at a historical period or place (e.g., 1920s Paris), explicitly anchor each imagePrompt and bRollPrompt in that era with era-accurate details (fashion, tech, lighting, vehicles, architecture).",
    "Return a JSON object with a single key 'scenes' containing the array."
  ];
  if (script) {
    parts.push("Script to split into scenes (hook/context/ladder/etc. are just narration text):");
    parts.push(script);
  }
  return parts.join("\n\n");
};

const buildVeoVideoPrompt = (params: {
  topic: string;
  scenes: AiScene[];
  style: ProjectStyle;
}) => {
  const { topic, scenes, style } = params;
  const lines = [
    `Generate a faceless short video (~8 seconds) for the topic "${topic}".`,
    `Visual style: ${styleGuidance[style]}.`,
    "Use the provided ordered scenes as the voiceover lines; keep visuals tightly aligned to each line's era/location/tone.",
    "Return cinematic shots that can stitch together seamlessly; maintain historical/setting consistency across all shots.",
    "Voiceover + visual plan:",
    ...scenes.map(
      (scene) =>
        `Scene ${scene.sceneNumber}: VO="${scene.description}" | imagePrompt="${scene.imagePrompt}" | bRollPrompt="${scene.bRollPrompt}" | duration=${scene.duration || 2}s`
    ),
    "Do not add a host. Keep narration as provided. Ensure era-accurate props/wardrobe if implied (e.g., 1920s Paris)."
  ];
  return lines.join("\n");
};

const buildRegeneratePrompt = (params: {
  topic: string;
  sceneNumber?: number;
  context?: string;
  instructions?: string;
  script?: string;
  style: ProjectStyle;
}) => {
  const { topic, sceneNumber, context, instructions, script, style } = params;
  const parts = [
    `Regenerate scene ${sceneNumber ?? 1} for a faceless video on "${topic}".`,
    `Visual style: ${styleGuidance[style]}.`,
    "Provide fields: description, imagePrompt, bRollPrompt, duration (seconds).",
    "Make every visual cue consistent with any implied era/place in the topic/script/context (e.g., 1920s Paris = period clothing, vintage vehicles, muted film grain, era-accurate props)."
  ];
  if (context) {
    parts.push("Context from nearby scenes to keep continuity:");
    parts.push(context);
  }
  if (script) {
    parts.push("Use this user-provided script as source material:");
    parts.push(script);
  }
  if (instructions) {
    parts.push("Apply these specific instructions:");
    parts.push(instructions);
  }
  parts.push("Return a JSON object with a 'scene' field.");
  return parts.join("\n\n");
};

const requireClient = () => {
  if (!client) throw new HttpError(500, "OpenAI API key is not configured");
  return client;
};

const requireGeminiClient = () => {
  if (!geminiClient) throw new HttpError(500, "Gemini API key is not configured");
  return geminiClient;
};

const makeScriptPrompt = (params: { prompt: string; language: string; duration: string }) => {
  const { prompt, language, duration } = params;
  const durationGuide: Record<"15-30" | "30-40" | "40-60" | "60-90", string> = {
    "15-30": "15-30 seconds",
    "30-40": "30-40 seconds",
    "40-60": "40-60 seconds",
    "60-90": "60-90 seconds"
  } as const;
  const range = durationGuide[duration as keyof typeof durationGuide] || duration;
  return [
    "Write a single, plain-text faceless video script (no JSON, no array).",
    `Language: ${language}.`,
    `Target duration: ${range}. Keep pacing so narration fits this range.`,
    "Style: spoken, visual, concise sentences; avoid host mentions; keep visuals implicit; strong hook and curiosity gaps.",
    "Structure: hook, context, escalation beats, twist/reveal, payoff/lesson, loopable ending.",
    "Return only the script text."
  ]
    .concat([`User prompt: ${prompt}`])
    .join("\n");
};

export const generateScriptWithAi = async (params: {
  prompt: string;
  language: string;
  duration: string;
  provider?: AiProvider;
}): Promise<{ script: string; usage?: AiUsageMetrics }> => {
  const { prompt, language, duration, provider = defaultProvider } = params;
  if (provider === "gemini" || provider === "veo") {
    const userPrompt = makeScriptPrompt({ prompt, language, duration });
    console.log({ userPrompt });
    const { text, usage } = await callGeminiJson({ prompt: userPrompt, temperature: 0.7 });
    return { script: text.trim(), usage };
  }

  try {
    const completion = await requireClient().chat.completions.create({
      model: defaultModel,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You write faceless short-form video scripts with strong hooks, curiosity gaps, and concise narration. Avoid host mentions."
        },
        { role: "user", content: makeScriptPrompt({ prompt, language, duration }) }
      ]
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from model");
    return { script: content, usage: mapUsage(completion.usage, defaultModel) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("AI script generation failed", err);
    throw new HttpError(500, "Failed to generate script with AI");
  }
};

const callGeminiJson = async (params: { prompt: string; temperature: number }) => {
  const { prompt, temperature } = params;
  const clientInstance = requireGeminiClient();
  const result = (await clientInstance.models.generateContent({
    model: defaultGeminiModel,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature, responseMimeType: "application/json" }
  })) as any;

  const extractText = (resp: any) => {
    const parts =
      resp?.response?.candidates?.[0]?.content?.parts ||
      resp?.candidates?.[0]?.content?.parts ||
      resp?.candidates?.[0]?.parts ||
      resp?.response?.candidates?.[0]?.parts ||
      [];
    return (
      parts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim() || ""
    );
  };

  const text = extractText(result);
  if (!text) throw new HttpError(500, "Empty response from Gemini");
  const usageMeta = result?.response?.usageMetadata ?? result?.usageMetadata;
  return { text, usage: mapGeminiUsage(usageMeta, defaultGeminiModel) };
};

const buildScriptRefinementPrompt = (params: { script: string; topic?: string }) => {
  const { script, topic } = params;
  const lines = [
    "You are a viral short-form content strategist.",
    "Refine the topic below into a high-retention faceless video script using this strict structure:",
    "1. Hook (0-2s, pattern break, curiosity-driven)",
    "2. One-line context (who / what / where)",
    "3. Escalation ladder (3-5 short beats, each increasing tension)",
    "4. Twist / reveal (the share-worthy moment)",
    "5. Payoff + clear lesson (emotional or practical)",
    "6. Loop ending (connects back to the hook so the video replays)",
    "Rules:",
    '* Faceless narration only (no "I", no on-screen speaker)',
    "* Short, punchy sentences",
    "* One dominant emotion throughout",
    "* No filler, no greetings",
    "* Spoken, cinematic language",
    "* 60-90 seconds total",
    "* End with a replay-worthy final line",
    "Output format:",
    "* Label each section clearly",
    "* After each section, add a short B-roll / visual cue in brackets",
    "* Keep captions bold and readable for TikTok / Reels / Shorts",
    `Topic to refine: ${topic ?? "Use the provided script as the idea"}`,
    "Original script / idea:",
    script,
    'Return JSON: { "script": "refined narration ready to split into scenes" }.'
  ];
  return lines.join("\n\n");
};

export const refineScriptForFacelessChannel = async (params: {
  script: string;
  topic?: string;
}): Promise<{ script: string; usage?: AiUsageMetrics }> => {
  const { script, topic } = params;
  try {
    const completion = await requireClient().chat.completions.create({
      model: defaultModel,
      response_format: { type: "json_object" },
      temperature: 0.65,
      messages: [
        { role: "system", content: SCRIPT_REFINE_SYSTEM_PROMPT },
        { role: "user", content: buildScriptRefinementPrompt({ script, topic }) }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");
    const parsed = parseJson(content);
    const rawScript = typeof parsed?.script !== "undefined" ? parsed.script : parsed;
    const refined = stringifyScriptPayload(rawScript).trim();
    if (!refined) throw new Error("No refined script returned");
    return { script: refined.slice(0, 5000), usage: mapUsage(completion.usage, defaultModel) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("OpenAI script refinement failed", err);
    throw new HttpError(500, "Failed to refine script with AI");
  }
};

const refineScriptWithGemini = async (params: {
  script: string;
  topic?: string;
}): Promise<{ script: string; usage?: AiUsageMetrics }> => {
  const { script, topic } = params;
  try {
    const prompt = buildScriptRefinementPrompt({ script, topic });
    const { text, usage } = await callGeminiJson({ prompt, temperature: 0.65 });
    const parsed = parseJson(text);
    const rawScript = typeof parsed?.script !== "undefined" ? parsed.script : parsed;
    const refined = stringifyScriptPayload(rawScript).trim();
    if (!refined) throw new Error("No refined script returned");
    return { script: refined.slice(0, 5000), usage };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Gemini script refinement failed", err);
    throw new HttpError(500, "Failed to refine script with Gemini");
  }
};

const generateScenesWithOpenAi = async (params: {
  topic: string;
  sceneCount: number;
  script?: string;
  style: ProjectStyle;
  refine: boolean;
}): Promise<{
  scenes: AiScene[];
  scriptUsed?: string;
  refinedScript?: string;
  usage?: AiUsageMetrics;
  refinementUsage?: AiUsageMetrics;
}> => {
  const { topic, sceneCount, script, style, refine } = params;
  const refinement =
    refine && script ? await refineScriptForFacelessChannel({ script, topic }) : undefined;
  const scriptForScenes = refinement?.script ?? script;
  const completion = await requireClient().chat.completions.create({
    model: defaultModel,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildScenesPrompt(topic, sceneCount, style, scriptForScenes) }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");
  const parsed = parseJson(content);
  const scenes = normalizeScenes(parsed, sceneCount);
  return {
    scenes: scenes.map((scene, idx) => ({ ...scene, sceneNumber: idx + 1 })),
    scriptUsed: scriptForScenes,
    refinedScript: refinement?.script,
    usage: mapUsage(completion.usage, defaultModel),
    refinementUsage: refinement?.usage
  };
};

const generateScenesWithGemini = async (params: {
  topic: string;
  sceneCount: number;
  script?: string;
  style: ProjectStyle;
  refine: boolean;
  provider?: AiProvider;
}): Promise<{
  scenes: AiScene[];
  scriptUsed?: string;
  refinedScript?: string;
  usage?: AiUsageMetrics;
  refinementUsage?: AiUsageMetrics;
}> => {
  const { topic, sceneCount, script, style, refine, provider } = params;
  const refinement =
    refine && script ? await refineScriptWithGemini({ script, topic }) : undefined;
  const scriptForScenes = refinement?.script ?? script;
  const prompt =
    provider === "veo"
      ? buildVeoScenesPrompt(topic, style, scriptForScenes)
      : buildScenesPrompt(topic, sceneCount, style, scriptForScenes);
  const limit = provider === "veo" ? undefined : sceneCount;
  const { text, usage } = await callGeminiJson({ prompt, temperature: 0.7 });
  const parsed = parseJson(text);
  const scenes = normalizeScenes(parsed, limit);
  return {
    scenes: scenes.map((scene, idx) => ({ ...scene, sceneNumber: idx + 1 })),
    scriptUsed: scriptForScenes,
    refinedScript: refinement?.script,
    usage,
    refinementUsage: refinement?.usage
  };
};

export const generateScenesForTopic = async (params: {
  topic: string;
  sceneCount?: number;
  script?: string;
  style?: ProjectStyle;
  provider?: AiProvider;
  refine?: boolean;
}): Promise<{
  scenes: AiScene[];
  scriptUsed?: string;
  refinedScript?: string;
  usage?: AiUsageMetrics;
  refinementUsage?: AiUsageMetrics;
}> => {
  const {
    topic,
    sceneCount = 4,
    script,
    style = defaultStyle,
    provider = defaultProvider,
    refine = false
  } = params;
  const targetCount = clamp(sceneCount, 1, 20);

  if (provider === "gemini" || provider === "veo") {
    return generateScenesWithGemini({
      topic,
      sceneCount: targetCount,
      script,
      style,
      refine,
      provider
    });
  }

  try {
    return await generateScenesWithOpenAi({
      topic,
      sceneCount: targetCount,
      script,
      style,
      refine
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("OpenAI scene generation failed", err);
    throw new HttpError(500, "Failed to generate scenes with AI");
  }
};

export const generateVideoWithVeo = async (params: {
  topic: string;
  scenes: AiScene[];
  style: ProjectStyle;
}): Promise<{ videos?: { uri?: string }[]; operationName?: string }> => {
  const { topic, scenes, style } = params;
  const clientInstance = requireGeminiClient();
  const prompt = buildVeoVideoPrompt({ topic, scenes, style });
  const operation = await clientInstance.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt
  });
  const videos =
    operation.response?.generatedVideos?.map((vid: any) => ({
      uri: vid?.video?.uri ?? vid?.videoUri ?? vid?.uri
    })) ?? [];
  const operationName = operation.name ?? (operation as any)?.response?.name;
  return { videos, operationName };
};

export const getVeoVideoOperation = async (operationName: string): Promise<{
  videos?: { uri?: string }[];
  operationName: string;
  done: boolean;
}> => {
  const clientInstance = requireGeminiClient();
  const op = await clientInstance.operations.getVideosOperation({
    operation: { name: operationName } as any
  });
  const videos =
    op.response?.generatedVideos?.map((vid: any) => ({
      uri: vid?.video?.uri ?? vid?.videoUri ?? vid?.uri
    })) ?? [];
  return {
    videos,
    operationName: op.name ?? operationName,
    done: Boolean(videos.length)
  };
};

export const generateVideoFromScript = async (params: {
  script: string;
  style?: ProjectStyle;
}): Promise<{
  statusCode?: number;
  payload: {
    status: "completed";
    provider: "veo";
    operationName: null;
    videoUri: null;
    topic: string;
    sequences: {
      sequenceNumber: number;
      audio: string;
      imagePrompt: string;
      bRollPrompt: string;
      duration: number;
    }[];
  };
}> => {
  const { script, style = defaultStyle } = params;
  const topic = deriveTopicFromScript(script);
  const sceneCount = estimateSceneCountFromScript(script);

  // Generate scenes with Gemini/Veo style prompt so visuals and voiceover stay aligned.
  const scenesResult = await generateScenesWithGemini({
    topic,
    sceneCount,
    script,
    style,
    refine: false,
    provider: "veo"
  });

  const sequences = scenesResult.scenes.map((scene) => ({
    sequenceNumber: scene.sceneNumber,
    audio: scene.description,
    imagePrompt: scene.imagePrompt,
    bRollPrompt: scene.bRollPrompt,
    duration: clamp(
      Math.ceil((scene.description?.split(/\s+/).filter(Boolean).length || 0) / 2.5),
      1,
      6
    )
  }));

  return {
    statusCode: 200,
    payload: {
      status: "completed",
      provider: "veo",
      operationName: null,
      videoUri: null,
      topic,
      sequences
    }
  };
};

export const regenerateSceneWithAi = async (params: {
  topic: string;
  sceneNumber?: number;
  context?: string;
  instructions?: string;
  script?: string;
  style?: ProjectStyle;
}): Promise<{ scene: AiScene; usage?: AiUsageMetrics }> => {
  const { topic, sceneNumber, style = defaultStyle } = params;
  try {
    const completion = await requireClient().chat.completions.create({
      model: defaultModel,
      response_format: { type: "json_object" },
      temperature: 0.75,
      messages: [
        { role: "system", content: SINGLE_SCENE_PROMPT },
        { role: "user", content: buildRegeneratePrompt({ ...params, style }) }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");
    const parsed = parseJson(content);
    const scenePayload = parsed?.scene
      ? parsed.scene
      : Array.isArray(parsed?.scenes)
        ? parsed.scenes[0]
        : Array.isArray(parsed)
          ? parsed[0]
          : parsed;
    const normalized = normalizeScene(scenePayload, (sceneNumber ?? 1) - 1);
    return {
      scene: { ...normalized, sceneNumber: sceneNumber ?? normalized.sceneNumber ?? 1 },
      usage: mapUsage(completion.usage, defaultModel)
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("OpenAI scene regeneration failed", err);
    throw new HttpError(500, "Failed to regenerate scene with AI");
  }
};
