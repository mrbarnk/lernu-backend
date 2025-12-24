import { Request, Response } from "express";
import { Post } from "../models/Post";
import { User } from "../models/User";
import { buildCursorFilter } from "../utils/pagination";
import { serializePost, serializeUser } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const authorLevelMatch = { level: { $gte: 7 } };
const isLevelSevenAuthor = (author?: any) =>
  typeof author?.level === "number" && author.level >= 7;

export const searchAll = async (req: Request, res: Response) => {
  const { q } = req.query as { q: string };
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  const pattern = new RegExp(q, "i");

  const [users, posts] = await Promise.all([
    User.find({ $or: [{ username: pattern }, { displayName: pattern }] }, authorProjection)
      .limit(limit)
      .lean(),
    Post.find({ $text: { $search: q }, ...buildCursorFilter(undefined) })
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .limit(limit)
      .populate({ path: "author", select: authorProjection, match: authorLevelMatch })
      .lean()
  ]);

  const levelSevenPosts = posts.filter((post) => isLevelSevenAuthor((post as any).author));

  res.json({
    users: users.map((u) => serializeUser(u as any, req.user?._id)),
    posts: levelSevenPosts.map((p) =>
      serializePost(p as any, req.user?._id, { excerptLength: 240 })
    )
  });
};
