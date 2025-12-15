import { Document, Model, Schema, Types, model } from "mongoose";

export interface VideoSequence {
  sequenceNumber: number;
  audio: string;
  imagePrompt: string;
  bRollPrompt: string;
  duration: number;
  audioDataUri?: string;
  imageDataUri?: string;
}

export interface VideoGenerationAttrs {
  userId: Types.ObjectId;
  script: string;
  style?: string;
  topic: string;
  provider: string;
  sequences: VideoSequence[];
  videoUri?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  progress?: number;
}

export interface VideoGenerationDocument extends Document, VideoGenerationAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const sequenceSchema = new Schema<VideoSequence>(
  {
    sequenceNumber: { type: Number, required: true },
    audio: { type: String, required: true },
    imagePrompt: { type: String, required: true },
    bRollPrompt: { type: String, required: true },
    duration: { type: Number, required: true }
  },
  { _id: false }
);

const videoGenerationSchema = new Schema<VideoGenerationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    script: { type: String, required: true, trim: true, maxlength: 5000 },
    style: { type: String, trim: true },
    topic: { type: String, required: true, trim: true, maxlength: 500 },
    provider: { type: String, required: true, trim: true },
    sequences: { type: [sequenceSchema], required: true },
    videoUri: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending"
    },
    progress: { type: Number, default: 0 }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

videoGenerationSchema.index({ userId: 1, createdAt: -1 });

export const VideoGeneration: Model<VideoGenerationDocument> = model<VideoGenerationDocument>(
  "VideoGeneration",
  videoGenerationSchema
);
