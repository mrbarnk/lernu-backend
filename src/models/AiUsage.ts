import { Document, Model, Schema, Types, model } from "mongoose";

export interface AiUsageAttrs {
  userId: Types.ObjectId;
  action: string;
  aiModel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export interface AiUsageDocument extends Document, AiUsageAttrs {}

const aiUsageSchemaDefinition: Record<Exclude<keyof AiUsageAttrs, "createdAt">, any> = {
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true, trim: true },
  aiModel: { type: String, required: true, trim: true },
  promptTokens: { type: Number, required: true },
  completionTokens: { type: Number, required: true },
  totalTokens: { type: Number, required: true },
  metadata: { type: Object }
};

const aiUsageSchema = new Schema<AiUsageDocument>(aiUsageSchemaDefinition, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const AiUsage: Model<AiUsageDocument> = model<AiUsageDocument>("AiUsage", aiUsageSchema);
