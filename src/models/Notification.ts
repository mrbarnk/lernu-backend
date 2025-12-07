import { Document, Model, Schema, Types, model } from "mongoose";

export type NotificationType = "like" | "comment" | "mention";

export interface NotificationAttrs {
  user: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;
  postId?: Types.ObjectId;
  postTitle?: string;
}

export interface NotificationDocument extends Document, NotificationAttrs {
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "comment", "mention"], required: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
    postTitle: String,
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
