import { Types } from "mongoose";
import { User } from "../models/User";
import { HttpError } from "../middleware/error";

export const CONTRIBUTION_CREDIT_REWARD = 4;

export const consumeUserCredits = async (userId: Types.ObjectId, amount: number): Promise<number> => {
  const updated = await User.findOneAndUpdate(
    { _id: userId, aiCredits: { $gte: amount } },
    { $inc: { aiCredits: -amount } },
    { new: true }
  );

  if (updated) return updated.aiCredits ?? 0;

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }

  if (typeof user.aiCredits !== "number") {
    user.aiCredits = 20;
    await user.save();
    return consumeUserCredits(userId, amount);
  }

  if ((user.aiCredits ?? 0) < amount) {
    throw new HttpError(429, "You have no AI credits left. Please top up to generate more scripts.");
  }

  user.aiCredits -= amount;
  await user.save();
  return user.aiCredits ?? 0;
};

export const refundUserCredits = async (userId: Types.ObjectId, amount: number) => {
  await User.updateOne({ _id: userId }, { $inc: { aiCredits: amount } });
};

export const maybeAwardDailyContributionCredits = async (params: {
  userId: Types.ObjectId;
  content?: string;
  minLength?: number;
  amount?: number;
}): Promise<{ awarded: boolean; credits?: number }> => {
  const { userId, content, minLength = 120, amount = CONTRIBUTION_CREDIT_REWARD } = params;

  if (!content || content.trim().length < minLength) {
    return { awarded: false };
  }

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { aiCreditLastEarnedAt: { $lt: startOfToday } },
        { aiCreditLastEarnedAt: { $exists: false } }
      ]
    },
    { $inc: { aiCredits: amount }, $set: { aiCreditLastEarnedAt: now } },
    { new: true }
  );

  return { awarded: Boolean(updated), credits: updated?.aiCredits ?? undefined };
};
