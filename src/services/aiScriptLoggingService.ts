import { Types } from "mongoose";
import { AiScriptGeneration } from "../models/AiScriptGeneration";
import { AiUsageMetrics } from "./aiUsageService";

export const recordScriptGeneration = async (params: {
  userId: Types.ObjectId;
  prompt: string;
  script: string;
  topic?: string;
  topicCategory?: string;
  format?: string;
  resolvedFormat?: string;
  duration?: string;
  language?: string;
  usage?: AiUsageMetrics;
  modelId?: string;
}) => {
  const { userId, prompt, script, topic, topicCategory, format, resolvedFormat, duration, language, usage, modelId } =
    params;
  await AiScriptGeneration.create({
    userId,
    prompt,
    script,
    topic,
    topicCategory,
    format,
    resolvedFormat,
    duration,
    language,
    aiModel: modelId ?? usage?.model,
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    totalTokens: usage?.totalTokens
  });
};
