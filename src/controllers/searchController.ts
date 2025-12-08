import { Request, Response } from "express";
import { Post } from "../models/Post";
import { User } from "../models/User";
import { buildCursorFilter } from "../utils/pagination";
import { serializePost, serializeUser } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

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
      .populate("author", authorProjection)
      .lean()
  ]);

  res.json({
    users: users.map((u) => serializeUser(u as any, req.user?._id)),
    posts: posts.map((p) => serializePost(p as any, req.user?._id, { excerptLength: 240 }))
  });
};
