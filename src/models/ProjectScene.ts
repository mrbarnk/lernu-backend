import { Document, Model, Schema, Types, model } from "mongoose";

export interface ProjectSceneAttrs {
  projectId: Types.ObjectId;
  sceneNumber: number;
  description: string;
  imagePrompt?: string;
  bRollPrompt?: string;
  duration?: number;
  narration?: string;
  captionText?: string;
  timingPlan?: Record<string, unknown>;
  mediaType?: "image" | "video";
  mediaUri?: string;
  mediaTrimStart?: number;
  mediaTrimEnd?: number;
  mediaAnimation?: string;
  audioUri?: string;
}

export interface ProjectSceneDocument extends Document, ProjectSceneAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const projectSceneSchema = new Schema<ProjectSceneDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    sceneNumber: { type: Number, required: true, min: 1 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    imagePrompt: { type: String, trim: true, maxlength: 1000 },
    bRollPrompt: { type: String, trim: true, maxlength: 1000 },
    duration: { type: Number, default: 5, min: 1, max: 6 },
    narration: { type: String, trim: true, maxlength: 2000 },
    captionText: { type: String, trim: true, maxlength: 2000 },
    timingPlan: { type: Schema.Types.Mixed },
    mediaType: { type: String, enum: ["image", "video"], trim: true },
    mediaUri: { type: String, trim: true, maxlength: 2000 },
    mediaTrimStart: { type: Number, min: 0 },
    mediaTrimEnd: { type: Number, min: 0 },
    mediaAnimation: { type: String, trim: true, maxlength: 200 },
    audioUri: { type: String, trim: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

projectSceneSchema.index({ projectId: 1, sceneNumber: 1 }, { unique: true });
projectSceneSchema.index({ projectId: 1, createdAt: 1 });

export const ProjectScene: Model<ProjectSceneDocument> = model<ProjectSceneDocument>(
  "ProjectScene",
  projectSceneSchema
);
