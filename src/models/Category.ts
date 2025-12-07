import { Document, Model, Schema, model } from "mongoose";

export interface CategoryAttrs {
  name: string;
  icon: string;
  color: string;
}

export interface CategoryDocument extends Document, CategoryAttrs {}

const categorySchema = new Schema<CategoryDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    icon: { type: String, required: true },
    color: { type: String, required: true }
  },
  { versionKey: false }
);

export const Category: Model<CategoryDocument> = model<CategoryDocument>("Category", categorySchema);
