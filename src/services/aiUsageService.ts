import { Types } from "mongoose";
import { AiUsage } from "../models/AiUsage";

export type AiUsageMetrics = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
};

export const recordAiUsage = async (params: {
  userId: Types.ObjectId;
  action: string;
  usage?: AiUsageMetrics;
  metadata?: Record<string, unknown>;
}) => {
  const { userId, action, usage, metadata } = params;
  if (!usage) return;
  await AiUsage.create({
    userId,
    action,
    aiModel: usage.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    metadata
  });
};
