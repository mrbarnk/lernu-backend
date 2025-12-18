import { Document, Model, Schema, Types, model } from "mongoose";
import { UserDocument } from "./User";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

export interface CourseAttrs {
  author: Types.ObjectId | UserDocument;
  authorName: string;
  authorAvatar?: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  thumbnail?: string;
  category: string;
  difficulty: CourseDifficulty;
  durationMinutes: number;
  lessonsCount: number;
  enrolledCount: number;
  isPublished: boolean;
  isFeatured: boolean;
}

export interface CourseDocument extends Document, CourseAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<CourseDocument>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    authorAvatar: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, required: true, trim: true, maxlength: 400 },
    content: { type: String, required: true },
    thumbnail: { type: String },
    category: { type: String, required: true, trim: true, lowercase: true },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner"
    },
    durationMinutes: { type: Number, default: 0, min: 0 },
    lessonsCount: { type: Number, default: 0, min: 0 },
    enrolledCount: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ title: "text", description: "text", content: "text" });
courseSchema.index({ category: 1, difficulty: 1, isPublished: 1 });
courseSchema.index({ author: 1, isPublished: 1 });

export const Course: Model<CourseDocument> = model<CourseDocument>("Course", courseSchema);
