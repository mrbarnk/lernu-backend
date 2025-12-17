import bcrypt from "bcryptjs";
import { Document, Model, Schema, Types, model } from "mongoose";

export type UserRole = "user" | "moderator" | "admin";
export type BadgeType = "verified" | "platinum" | "gold" | "moderator" | "contributor";

export interface LoginHistoryEntry {
  ip: string;
  loggedInAt: Date;
}

export interface UserAttrs {
  email: string;
  username: string;
  displayName: string;
  password: string;
  avatar?: string;
  coverPhoto?: string;
  bio?: string;
  level?: number;
  isOnline?: boolean;
  role?: UserRole;
  joinedAt?: Date;
  badges?: BadgeType[];
  registrationIp?: string;
  registrationRef?: string;
  loginHistory?: LoginHistoryEntry[];
  aiCredits?: number;
  aiCreditLastEarnedAt?: Date;
}

export interface UserDocument extends Document, UserAttrs {
  refreshTokens?: string[];
  followers: Types.Array<Types.ObjectId>;
  following: Types.Array<Types.ObjectId>;
  loginHistory: LoginHistoryEntry[];
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    avatar: String,
    coverPhoto: String,
    bio: { type: String, maxlength: 280 },
    level: { type: Number, default: 1 },
    isOnline: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
    joinedAt: { type: Date, default: Date.now },
    badges: [{ type: String, enum: ["verified", "platinum", "gold", "moderator", "contributor"] }],
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: Schema.Types.ObjectId, ref: "User" }],
    refreshTokens: [{ type: String }],
    registrationIp: { type: String, trim: true, maxlength: 100 },
    registrationRef: { type: String, trim: true, maxlength: 100 },
    loginHistory: {
      type: [
        {
          ip: { type: String, required: true, trim: true, maxlength: 100 },
          loggedInAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    aiCredits: { type: Number, default: 5, min: 0 },
    aiCreditLastEarnedAt: { type: Date }
  },
  {
    versionKey: false
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function compare(candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<UserDocument> = model<UserDocument>("User", userSchema);
