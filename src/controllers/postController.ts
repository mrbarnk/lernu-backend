import { Request, Response } from "express";
import { Types } from "mongoose";
import { Category } from "../models/Category";
import { Post } from "../models/Post";
import { Report } from "../models/Report";
import { HttpError } from "../middleware/error";
import { parsePagination, buildCursorFilter, getNextCursor } from "../utils/pagination";
import { serializePost } from "../utils/serializers";
import { maybeAwardDailyContributionCredits, CONTRIBUTION_CREDIT_REWARD } from "../services/creditService";
import { notifyMentions, notifyUser } from "../services/notificationService";
import { sanitizeText } from "../utils/sanitize";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers";

const ensureValidObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

const userRole = (req: Request) => req.user?.role ?? "user";
const canModerateRole = (role: string) => role === "moderator" || role === "admin";
const sameId = (a: Types.ObjectId | string, b: Types.ObjectId | string) =>
  a.toString() === b.toString();

export const listPosts = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query);
  const { categoryId, search, type } = req.query as { categoryId?: string; search?: string; type?: string };
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) };
  if (categoryId) {
    ensureValidObjectId(categoryId, "Invalid category");
    filter.categoryId = new Types.ObjectId(categoryId);
  }
  if (search) filter.$text = { $search: search };
  if (type === "quality") {
    filter.$expr = {
      $and: [
        { $gte: [{ $strLenCP: "$title" }, 24] },
        { $gte: [{ $strLenCP: "$content" }, 400] }
      ]
    };
  }

  const posts = await Post.find(filter)
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: posts.map((post) => serializePost(post as any, req.user?._id, { excerptLength: 240 })),
    nextCursor: getNextCursor(posts as any, limit)
  });
};

const parseWindowHours = (window?: string) => {
  if (!window) return 24;
  if (window.endsWith("h")) return Number(window.replace("h", "")) || 24;
  if (window.endsWith("d")) return (Number(window.replace("d", "")) || 1) * 24;
  return Number(window) || 24;
};

export const trendingPosts = async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 3, 10);
  const hours = parseWindowHours(req.query.window as string);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const posts = await Post.find({ createdAt: { $gte: since } })
    .populate("author", authorProjection)
    .lean();

  const ranked = posts
    .map((p) => ({
      ...p,
      engagementScore: (p.likes ?? 0) + (p.commentsCount ?? 0) * 2 + (p.shares ?? 0)
    }))
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limit);

  res.json({
    items: ranked.map((post) => serializePost(post as any, req.user?._id, { excerptLength: 240 }))
  });
};

export const trendingTags = async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  const tags = await Post.aggregate([
    { $unwind: "$tags" },
    { $group: { _id: { $toLower: "$tags" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);

  res.json({
    topics: tags.map((t) => ({ tag: t._id, count: t.count }))
  });
};

export const getPost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id)
    .populate("author", authorProjection)
    .lean();
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post: { ...serializePost(post as any, req.user?._id), content: post.content } });
};

export const createPost = async (req: Request, res: Response) => {
  const { title, content, categoryId, code, images, tags } = req.body;
  const category = await Category.findById(categoryId);
  if (!category) throw new HttpError(400, "Invalid category");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const safeTitle = sanitizeText(title) || title;
  const safeContent = sanitizeText(content) || content;

  const post = await Post.create({
    title: safeTitle,
    content: safeContent,
    categoryId,
    code,
    images,
    tags,
    author: req.user._id
  });

  await notifyMentions(safeContent, req.user._id, post._id, safeTitle);

  await post.populate("author", authorProjection);
  const creditResult = await maybeAwardDailyContributionCredits({
    userId: req.user._id,
    content: safeContent
  });

  res.status(201).json({
    post: serializePost(post as any, req.user._id),
    creditsAwarded: creditResult.awarded ? CONTRIBUTION_CREDIT_REWARD : 0,
    aiCredits: creditResult.credits
  });
};

export const updatePost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const isAuthor = sameId(post.author as Types.ObjectId, req.user._id);
  const role = userRole(req);
  if (!isAuthor && !canModerateRole(role)) throw new HttpError(403, "Forbidden");

  const { isPinned, isSolved, ...fields } = req.body;
  const canPin =
    canModerateRole(role) || (isAuthor && typeof req.user.level === "number" && req.user.level >= 7);
  if ((isPinned !== undefined || isSolved !== undefined) && (!canModerateRole(role) && !canPin)) {
    throw new HttpError(403, "Only moderators or authors with level 7+ can change pin/solve state");
  }

  if (fields.categoryId) {
    ensureValidObjectId(fields.categoryId, "Invalid category");
    const exists = await Category.exists({ _id: fields.categoryId });
    if (!exists) throw new HttpError(400, "Invalid category");
  }

  if (fields.title !== undefined) post.title = sanitizeText(fields.title) || fields.title;
  if (fields.content !== undefined) post.content = sanitizeText(fields.content) || fields.content;
  if (fields.categoryId !== undefined) post.categoryId = fields.categoryId;
  if (fields.code !== undefined) post.code = fields.code;
  if (fields.images !== undefined) post.images = fields.images;
  if (fields.tags !== undefined) post.tags = fields.tags;
  if (isPinned !== undefined) post.isPinned = isPinned;
  if (isSolved !== undefined) post.isSolved = isSolved;
  post.isEdited = true;

  await post.save();
  await post.populate("author", authorProjection);
  res.json({ post: serializePost(post as any, req.user._id) });
};

export const deletePost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");
  const isAuthor = sameId(post.author as Types.ObjectId, req.user._id);
  if (!isAuthor && !canModerateRole(userRole(req))) throw new HttpError(403, "Forbidden");
  await post.deleteOne();
  res.json({ message: "Post deleted" });
};

export const likePost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id).populate("author", authorProjection);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const likedBy = post.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.addToSet(req.user._id);
  post.likes = likedBy.length;
  await post.save();

  await notifyUser({
    userId: post.author as any,
    actorId: req.user._id,
    type: "like",
    postId: post._id,
    postTitle: post.title
  });

  res.json({ post: serializePost(post as any, req.user._id) });
};

export const unlikePost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id).populate("author", authorProjection);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const likedBy = post.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.pull(req.user._id);
  post.likes = likedBy.length;
  await post.save();

  res.json({ post: serializePost(post as any, req.user._id) });
};

export const bookmarkPost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id).populate("author", authorProjection);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const bookmarked = post.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.addToSet(req.user._id);
  await post.save();

  res.json({ post: serializePost(post as any, req.user._id) });
};

export const unbookmarkPost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findById(req.params.id).populate("author", authorProjection);
  if (!post) throw new HttpError(404, "Post not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const bookmarked = post.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.pull(req.user._id);
  await post.save();

  res.json({ post: serializePost(post as any, req.user._id) });
};

export const sharePost = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid post id");
  const post = await Post.findByIdAndUpdate(
    req.params.id,
    { $inc: { shares: 1 } },
    { new: true }
  ).populate("author", authorProjection);
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post: serializePost(post as any, req.user?._id) });
};

export const reportPost = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  ensureValidObjectId(req.params.id, "Invalid post id");
  await Report.create({
    targetType: "post",
    targetId: req.params.id,
    reporter: req.user._id,
    reason: req.body?.reason
  });
  res.status(201).json({ message: "Report submitted" });
};
