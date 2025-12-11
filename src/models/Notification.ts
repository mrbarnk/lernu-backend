import { Document, Model, Schema, Types, model } from "mongoose";

export type NotificationType = "like" | "comment" | "mention" | "follow";

export interface NotificationAttrs {
  user: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;
  postId?: Types.ObjectId;
  postTitle?: string;
  reelId?: Types.ObjectId;
  reelTitle?: string;
  commentId?: Types.ObjectId;
}

export interface NotificationDocument extends Document, NotificationAttrs {
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "comment", "mention", "follow"], required: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
    postTitle: String,
    reelId: { type: Schema.Types.ObjectId, ref: "Reel" },
    reelTitle: String,
    commentId: { type: Schema.Types.ObjectId, ref: "Comment" },
    isRead: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

export const Notification: Model<NotificationDocument> = model<NotificationDocument>(
  "Notification",
  notificationSchema
);
