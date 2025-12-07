import { Request, Response } from "express";
import { Types } from "mongoose";
import { Post } from "../models/Post";
import { User } from "../models/User";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializePost, serializeUser } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role";

const ensureValidObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

export const getUserProfile = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid user id");
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, "User not found");

  const recentPosts = await Post.find({ author: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("author", authorProjection)
    .lean();

  res.json({
    user: serializeUser(user),
    recentPosts: recentPosts.map((p) => serializePost(p as any, req.user?._id))
  });
};

export const getUserPosts = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid user id");
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const userId = new Types.ObjectId(req.params.id);

  const posts = await Post.find({ author: userId, ...buildCursorFilter(cursor) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: posts.map((p) => serializePost(p as any, req.user?._id)),
    nextCursor: getNextCursor(posts as any, limit)
  });
};

export const updateUser = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid user id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const userId = req.params.id;
  const isSelf = req.user._id.equals(userId);
  if (!isSelf && req.user.role !== "admin") throw new HttpError(403, "Forbidden");

  const user = await User.findByIdAndUpdate(userId, req.body, { new: true });
  if (!user) throw new HttpError(404, "User not found");
  res.json({ user: serializeUser(user) });
};
