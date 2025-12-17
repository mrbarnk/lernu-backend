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
}) => {
  const { userId, prompt, script, topic, topicCategory, format, resolvedFormat, duration, language, usage } =
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
    aiModel: usage?.model,
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    totalTokens: usage?.totalTokens
  });
};
