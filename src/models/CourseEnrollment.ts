import { Document, Model, Schema, Types, model } from "mongoose";
import { CourseDocument } from "./Course";
import { UserDocument } from "./User";

export interface CourseEnrollmentAttrs {
  courseId: Types.ObjectId | CourseDocument;
  userId: Types.ObjectId | UserDocument;
  enrolledAt?: Date;
}

export interface CourseEnrollmentDocument extends Document, CourseEnrollmentAttrs {
  enrolledAt: Date;
}

const courseEnrollmentSchema = new Schema<CourseEnrollmentDocument>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrolledAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

courseEnrollmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });
courseEnrollmentSchema.index({ userId: 1 });

export const CourseEnrollment: Model<CourseEnrollmentDocument> = model<CourseEnrollmentDocument>(
  "CourseEnrollment",
  courseEnrollmentSchema
);
