import OpenAI from "openai";
import { env } from "../config/env";
import { HttpError } from "../middleware/error";

export interface AiScene {
  sceneNumber: number;
  description: string;
  imagePrompt: string;
  bRollPrompt: string;
  duration: number;
}

const client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
const defaultModel = env.openAiModel ?? "gpt-4o-mini";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SYSTEM_PROMPT = `You are an expert video content planner for short, faceless videos.
Break topics into clear, sequential scenes with vivid visual direction and matching b-roll ideas.
Avoid referring to on-camera hosts; focus on what the viewer sees. Always answer with JSON only.`;

const SINGLE_SCENE_PROMPT = `You rewrite individual scenes for a faceless video, keeping them concise and visual-first.
Return a JSON object only.`;

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
    duration: clamp(rawDuration || 5, 1, 5)
  };
};

const normalizeScenes = (data: any, targetCount: number): AiScene[] => {
  const scenesArray = Array.isArray(data?.scenes)
    ? data.scenes
    : Array.isArray(data)
      ? data
      : [];
  if (!scenesArray.length) throw new Error("No scenes returned");
  return scenesArray
    .slice(0, targetCount)
    .map((scene: unknown, idx: number) => normalizeScene(scene, idx));
};

const buildScenesPrompt = (topic: string, sceneCount: number, script?: string) => {
  const parts = [
    `Create ${sceneCount} short scenes for a faceless video on "${topic}".`,
    "For each scene include: description (1-2 sentences), imagePrompt (cinematic still prompt), bRollPrompt (supporting footage), and duration in seconds.",
    "Each scene/b-roll should be no longer than 5 seconds. Keep narration concise, action-oriented, and avoid direct address to camera."
  ];
  if (script) {
    parts.push("Break the user's script into scenes while keeping the tone and key points:");
    parts.push(script);
  } else {
    parts.push("If details are missing, make smart assumptions that help teach or explain the topic.");
  }
  parts.push("Return a JSON object with a single key 'scenes' containing the array.");
  return parts.join("\n\n");
};

const buildRegeneratePrompt = (params: {
  topic: string;
  sceneNumber?: number;
  context?: string;
  instructions?: string;
  script?: string;
}) => {
  const { topic, sceneNumber, context, instructions, script } = params;
  const parts = [
    `Regenerate scene ${sceneNumber ?? 1} for a faceless video on "${topic}".`,
    "Provide fields: description, imagePrompt, bRollPrompt, duration (seconds)."
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

export const generateScenesForTopic = async (params: {
  topic: string;
  sceneCount?: number;
  script?: string;
}): Promise<AiScene[]> => {
  const { topic, sceneCount = 4, script } = params;
  const targetCount = clamp(sceneCount, 1, 20);
  try {
    const completion = await requireClient().chat.completions.create({
      model: defaultModel,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildScenesPrompt(topic, targetCount, script) }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from model");
    const parsed = parseJson(content);
    const scenes = normalizeScenes(parsed, targetCount);
    return scenes.map((scene, idx) => ({ ...scene, sceneNumber: idx + 1 }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("OpenAI scene generation failed", err);
    throw new HttpError(500, "Failed to generate scenes with AI");
  }
};

export const regenerateSceneWithAi = async (params: {
  topic: string;
  sceneNumber?: number;
  context?: string;
  instructions?: string;
  script?: string;
}): Promise<AiScene> => {
  const { topic, sceneNumber } = params;
  try {
    const completion = await requireClient().chat.completions.create({
      model: defaultModel,
      response_format: { type: "json_object" },
      temperature: 0.75,
      messages: [
        { role: "system", content: SINGLE_SCENE_PROMPT },
        { role: "user", content: buildRegeneratePrompt(params) }
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
    return { ...normalized, sceneNumber: sceneNumber ?? normalized.sceneNumber ?? 1 };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("OpenAI scene regeneration failed", err);
    throw new HttpError(500, "Failed to regenerate scene with AI");
  }
};
