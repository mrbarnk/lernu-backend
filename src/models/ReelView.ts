import { Document, Model, Schema, Types, model } from "mongoose";

export interface ReelViewAttrs {
  reelId: Types.ObjectId;
  userId?: Types.ObjectId;
  watchedSeconds?: number;
}

export interface ReelViewDocument extends Document, ReelViewAttrs {
  createdAt: Date;
}

const reelViewSchema = new Schema<ReelViewDocument>(
  {
    reelId: { type: Schema.Types.ObjectId, ref: "Reel", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    watchedSeconds: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

reelViewSchema.index({ reelId: 1, userId: 1, createdAt: -1 });

export const ReelView: Model<ReelViewDocument> = model<ReelViewDocument>(
  "ReelView",
  reelViewSchema
);
