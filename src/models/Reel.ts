import { Document, Model, Schema, Types, model } from "mongoose";
import { UserDocument } from "./User";

export interface ReelAttrs {
  author: Types.ObjectId | UserDocument;
  title?: string;
  content?: string;
  videoUrl: string;
  thumbnail?: string;
  durationSeconds?: number;
  tags?: string[];
}

export interface ReelDocument extends Document, ReelAttrs {
  likes: number;
  shares: number;
  commentsCount: number;
  likedBy: Types.ObjectId[];
  bookmarkedBy: Types.ObjectId[];
  createdAt: Date;
}

const reelSchema = new Schema<ReelDocument>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, trim: true },
    content: { type: String, trim: true },
    videoUrl: { type: String, required: true },
    thumbnail: { type: String },
    durationSeconds: { type: Number },
    tags: [{ type: String }],
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    bookmarkedBy: [{ type: Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false }
);

reelSchema.index({ title: "text", content: "text", tags: "text" });

export const Reel: Model<ReelDocument> = model<ReelDocument>("Reel", reelSchema);
