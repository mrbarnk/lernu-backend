import { Document, Model, Schema, Types, model } from "mongoose";

export interface AiScriptGenerationAttrs {
  userId: Types.ObjectId;
  prompt: string;
  topicCategory?: string;
  format?: string;
  duration?: string;
  language?: string;
  script: string;
  topic?: string;
  resolvedFormat?: string;
  aiModel?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt?: Date;
}

export interface AiScriptGenerationDocument extends Document, AiScriptGenerationAttrs {}

const aiScriptGenerationSchema = new Schema<AiScriptGenerationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    prompt: { type: String, required: true, trim: true, maxlength: 6000 },
    topicCategory: { type: String, trim: true, maxlength: 200 },
    format: { type: String, trim: true, maxlength: 200 },
    duration: { type: String, trim: true, maxlength: 50 },
    language: { type: String, trim: true, maxlength: 20 },
    script: { type: String, required: true, trim: true, maxlength: 20000 },
    topic: { type: String, trim: true, maxlength: 500 },
    resolvedFormat: { type: String, trim: true, maxlength: 200 },
    aiModel: { type: String, trim: true, maxlength: 200 },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
    totalTokens: { type: Number }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

aiScriptGenerationSchema.index({ userId: 1, createdAt: -1 });

export const AiScriptGeneration: Model<AiScriptGenerationDocument> = model<AiScriptGenerationDocument>(
  "AiScriptGeneration",
  aiScriptGenerationSchema
);
