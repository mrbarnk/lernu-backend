import { Document, Model, Schema, Types, model } from "mongoose";
import { CourseDocument } from "./Course";

export interface CourseLessonAttrs {
  courseId: Types.ObjectId | CourseDocument;
  title: string;
  content: string;
  videoUrl?: string;
  durationMinutes: number;
  orderIndex: number;
  isFree: boolean;
}

export interface CourseLessonDocument extends Document, CourseLessonAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const courseLessonSchema = new Schema<CourseLessonDocument>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    content: { type: String, required: true },
    videoUrl: { type: String },
    durationMinutes: { type: Number, default: 0, min: 0 },
    orderIndex: { type: Number, default: 0, min: 0 },
    isFree: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

courseLessonSchema.index({ courseId: 1, orderIndex: 1 });

export const CourseLesson: Model<CourseLessonDocument> = model<CourseLessonDocument>(
  "CourseLesson",
  courseLessonSchema
);
