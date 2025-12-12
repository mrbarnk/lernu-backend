import { Document, Model, Schema, Types, model } from "mongoose";

export type ProjectStatus = "draft" | "in-progress" | "completed";
export type ProjectStyle =
  | "4k-realistic"
  | "clay"
  | "cinematic"
  | "brick"
  | "grudge"
  | "comic-book"
  | "muppet"
  | "ghibli"
  | "playground"
  | "voxel"
  | "anime"
  | "pixer-3d";

export interface ProjectAttrs {
  userId: Types.ObjectId;
  title: string;
  topic: string;
  description?: string;
  status?: ProjectStatus;
  style?: ProjectStyle;
}

export interface ProjectDocument extends Document, ProjectAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<ProjectDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    topic: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["draft", "in-progress", "completed"],
      default: "draft"
    },
    style: {
      type: String,
      enum: [
        "4k-realistic",
        "clay",
        "cinematic",
        "brick",
        "grudge",
        "comic-book",
        "muppet",
        "ghibli",
        "playground",
        "voxel",
        "anime",
        "pixer-3d"
      ],
      default: "cinematic"
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

projectSchema.index({ userId: 1, createdAt: -1 });

export const Project: Model<ProjectDocument> = model<ProjectDocument>("Project", projectSchema);
