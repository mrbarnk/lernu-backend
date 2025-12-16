import { Document, Model, Schema, Types, model } from "mongoose";

export interface AiConversationAttrs {
  userId: Types.ObjectId;
  title?: string;
  flowStep?: string;
  generatedScript?: string;
  selectedTopic?: string;
  selectedTopicId?: string;
  selectedFormat?: string;
  selectedFormatId?: string;
  selectedStyle?: unknown;
  selectedDuration?: string;
}

export interface AiConversationDocument extends Document, AiConversationAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const aiConversationSchema = new Schema<AiConversationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, trim: true, maxlength: 200, default: "New conversation" },
    flowStep: { type: String, trim: true, maxlength: 100 },
    generatedScript: { type: String, trim: true, maxlength: 20000 },
    selectedTopic: { type: String, trim: true, maxlength: 500 },
    selectedTopicId: { type: String, trim: true, maxlength: 200 },
    selectedFormat: { type: String, trim: true, maxlength: 200 },
    selectedFormatId: { type: String, trim: true, maxlength: 200 },
    selectedStyle: { type: Schema.Types.Mixed },
    selectedDuration: { type: String, trim: true, maxlength: 50 }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

export const AiConversation: Model<AiConversationDocument> = model<AiConversationDocument>(
  "AiConversation",
  aiConversationSchema
);
