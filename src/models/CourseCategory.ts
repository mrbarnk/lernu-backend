import { Document, Model, Schema, model } from "mongoose";

export interface CourseCategoryAttrs {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CourseCategoryDocument extends Document, CourseCategoryAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const courseCategorySchema = new Schema<CourseCategoryDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 280 },
    icon: { type: String, trim: true, maxlength: 60 },
    color: { type: String, trim: true, maxlength: 30 }
  },
  { timestamps: true, versionKey: false }
);

courseCategorySchema.index({ slug: 1 }, { unique: true });

export const CourseCategory: Model<CourseCategoryDocument> = model<CourseCategoryDocument>(
  "CourseCategory",
  courseCategorySchema
);
