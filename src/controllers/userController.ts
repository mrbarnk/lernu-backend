import { Request, Response } from "express";
import { Types } from "mongoose";
import { Post } from "../models/Post";
import { User } from "../models/User";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializePost, serializeUser } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers";

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
    user: serializeUser(user, req.user?._id),
    recentPosts: recentPosts.map((p) => serializePost(p as any, req.user?._id, { excerptLength: 200 }))
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
    items: posts.map((p) => serializePost(p as any, req.user?._id, { excerptLength: 240 })),
    nextCursor: getNextCursor(posts as any, limit)
  });
};

export const getUserProfileByUsername = async (req: Request, res: Response) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) throw new HttpError(404, "User not found");

  const recentPosts = await Post.find({ author: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("author", authorProjection)
    .lean();

  res.json({
    user: serializeUser(user, req.user?._id),
    recentPosts: recentPosts.map((p) => serializePost(p as any, req.user?._id, { excerptLength: 200 }))
  });
};

export const getUserPostsByUsername = async (req: Request, res: Response) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) throw new HttpError(404, "User not found");
  const { limit, cursor } = parsePagination(req.query, 10, 50);

  const posts = await Post.find({ author: user._id, ...buildCursorFilter(cursor) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: posts.map((p) => serializePost(p as any, req.user?._id, { excerptLength: 240 })),
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
  res.json({ user: serializeUser(user, req.user._id) });
};

export const searchUsers = async (req: Request, res: Response) => {
  const { q } = req.query as { q: string };
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  const pattern = new RegExp(q, "i");

  const users = await User.find(
    { $or: [{ username: pattern }, { displayName: pattern }] },
    authorProjection
  )
    .limit(limit)
    .lean();

  res.json({
    users: users.map((u) => serializeUser(u as any, req.user?._id))
  });
};

export const followUser = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid user id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (req.user._id.toString() === req.params.id) {
    throw new HttpError(400, "Cannot follow yourself");
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new HttpError(404, "User not found");

  const followers = target.followers as Types.Array<Types.ObjectId>;
  followers.addToSet(req.user._id);
  await target.save();

  const currentFollowing = req.user.following as Types.Array<Types.ObjectId>;
  currentFollowing.addToSet(target._id);
  await req.user.save();

  res.json({ user: serializeUser(target, req.user._id) });
};

export const unfollowUser = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid user id");
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (req.user._id.toString() === req.params.id) {
    throw new HttpError(400, "Cannot unfollow yourself");
  }

  const target = await User.findById(req.params.id);
  if (!target) throw new HttpError(404, "User not found");

  const followers = target.followers as Types.Array<Types.ObjectId>;
  followers.pull(req.user._id);
  await target.save();

  const currentFollowing = req.user.following as Types.Array<Types.ObjectId>;
  currentFollowing.pull(target._id);
  await req.user.save();

  res.json({ user: serializeUser(target, req.user._id) });
};
