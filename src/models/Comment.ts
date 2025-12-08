import { Document, Model, Schema, Types, model } from "mongoose";
import { CodeBlock } from "./Post";

export interface CommentAttrs {
  postId?: Types.ObjectId;
  reelId?: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  code?: CodeBlock;
  images?: string[];
  parentId?: Types.ObjectId | null;
}

export interface CommentDocument extends Document, CommentAttrs {
  likes: number;
  likedBy: Types.ObjectId[];
  isAccepted: boolean;
  isEdited: boolean;
  repliesCount: number;
  createdAt: Date;
}

const codeSchema = new Schema<CodeBlock>(
  {
    language: String,
    snippet: String
  },
  { _id: false }
);

const commentSchema = new Schema<CommentDocument>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
    reelId: { type: Schema.Types.ObjectId, ref: "Reel" },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    code: codeSchema,
    images: {
      type: [String],
      validate: [(val: unknown[]) => !val || val.length <= 4, "Too many images"]
    },
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    repliesCount: { type: Number, default: 0 },
    isAccepted: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

export const Comment: Model<CommentDocument> = model<CommentDocument>("Comment", commentSchema);
