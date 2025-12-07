import { Document, Model, Schema, Types, model } from "mongoose";

export type ReportTarget = "post" | "comment";

export interface ReportDocument extends Document {
  targetType: ReportTarget;
  targetId: Types.ObjectId;
  reporter: Types.ObjectId;
  reason?: string;
  createdAt: Date;
}

const reportSchema = new Schema<ReportDocument>(
  {
    targetType: { type: String, enum: ["post", "comment"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, maxlength: 500 }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

export const Report: Model<ReportDocument> = model<ReportDocument>("Report", reportSchema);
