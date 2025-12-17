import { Request, Response } from "express";
import { Post } from "../models/Post";
import { User } from "../models/User";

export const communityStats = async (_req: Request, res: Response) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [onlineUsers, postsToday, solvedPosts] = await Promise.all([
    User.countDocuments({ }),
    Post.countDocuments({ createdAt: { $gte: startOfDay } }),
    Post.countDocuments({ isSolved: true })
  ]);

  res.json({
    activeOnline: onlineUsers,
    postsToday,
    questionsSolved: solvedPosts
  });
};
