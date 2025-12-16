import { Document, Model, Schema, Types, model } from "mongoose";

export type AiMessageRole = "assistant" | "user";

export interface SceneSequence {
  sceneNumber: number;
  audioCaption: string;
  videoPrompt?: string;
  imagePrompt?: string;
  duration?: number;
}

export interface AiConversationMessageAttrs {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AiMessageRole;
  content: string;
  options?: unknown;
  scenes?: SceneSequence[];
}

export interface AiConversationMessageDocument extends Document, AiConversationMessageAttrs {
  createdAt: Date;
}

const sceneSchema = new Schema<SceneSequence>(
  {
    sceneNumber: { type: Number, required: true },
    audioCaption: { type: String, required: true, trim: true, maxlength: 1000 },
    videoPrompt: { type: String, trim: true, maxlength: 2000 },
    imagePrompt: { type: String, trim: true, maxlength: 2000 },
    duration: { type: Number }
  },
  { _id: false }
);

const aiConversationMessageSchema = new Schema<AiConversationMessageDocument>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "AiConversation", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["assistant", "user"], required: true },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    options: { type: Schema.Types.Mixed },
    scenes: [sceneSchema]
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

aiConversationMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const AiConversationMessage: Model<AiConversationMessageDocument> =
  model<AiConversationMessageDocument>("AiConversationMessage", aiConversationMessageSchema);
