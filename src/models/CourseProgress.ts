import { Document, Model, Schema, Types, model } from "mongoose";
import { CourseDocument } from "./Course";
import { UserDocument } from "./User";

export interface CourseProgressAttrs {
  courseId: Types.ObjectId | CourseDocument;
  userId: Types.ObjectId | UserDocument;
  completedLessons: Types.ObjectId[];
  progressPercent: number;
  startedAt: Date;
  lastAccessedAt: Date;
  completedAt?: Date;
}

export interface CourseProgressDocument extends Document, CourseProgressAttrs {}

const courseProgressSchema = new Schema<CourseProgressDocument>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completedLessons: [{ type: Schema.Types.ObjectId, ref: "CourseLesson" }],
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: { type: Date, default: Date.now },
    lastAccessedAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
  },
  { timestamps: false, versionKey: false }
);

courseProgressSchema.index({ courseId: 1, userId: 1 }, { unique: true });

export const CourseProgress: Model<CourseProgressDocument> = model<CourseProgressDocument>(
  "CourseProgress",
  courseProgressSchema
);
