import { Document, Model, Schema, Types, model } from "mongoose";
import { UserDocument } from "./User";
import { CategoryDocument } from "./Category";

export interface CodeBlock {
  language?: string;
  snippet: string;
}

export interface PostAttrs {
  author: Types.ObjectId | UserDocument;
  categoryId: Types.ObjectId | CategoryDocument;
  title?: string;
  content: string;
  code?: CodeBlock;
  images?: string[];
  tags?: string[];
  isPinned?: boolean;
  isSolved?: boolean;
}

export interface PostDocument extends Document, PostAttrs {
  likes: number;
  commentsCount: number;
  shares: number;
  likedBy: Types.ObjectId[];
  bookmarkedBy: Types.ObjectId[];
  isEdited: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

const codeSchema = new Schema<CodeBlock>(
  {
    language: String,
    snippet: String
  },
  { _id: false }
);

const postSchema = new Schema<PostDocument>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    title: { type: String, trim: true },
    content: { type: String, required: true },
    code: codeSchema,
    images: {
      type: [String],
      validate: [arrayLimit(4), "Too many images"]
    },
    tags: {
      type: [String],
      validate: [arrayLimit(5), "Too many tags"]
    },
    likes: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    bookmarkedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isPinned: { type: Boolean, default: false },
    isSolved: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

postSchema.index({ title: "text", content: "text", tags: "text" });

function arrayLimit(max: number) {
  return (val: unknown[]) => !val || val.length <= max;
}

export const Post: Model<PostDocument> = model<PostDocument>("Post", postSchema);
