import { Document, Model, Schema, Types, model } from "mongoose";

export interface ProjectSceneAttrs {
  projectId: Types.ObjectId;
  sceneNumber: number;
  description: string;
  imagePrompt?: string;
  bRollPrompt?: string;
  duration?: number;
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
    duration: { type: Number, default: 5, min: 1, max: 5 }
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
