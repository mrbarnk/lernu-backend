import { Request, Response } from "express";
import { Types } from "mongoose";
import { Comment } from "../models/Comment";
import { Post } from "../models/Post";
import { Reel } from "../models/Reel";
import { HttpError } from "../middleware/error";
import { notifyMentions } from "../services/notificationService";
import { buildCursorFilter, parsePagination } from "../utils/pagination";
import { generateUniqueSlug } from "../utils/postSlug";
import { serializeComment, serializePost, serializeReel } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const authorLevelMatch = { level: { $gte: 7 } };
const isLevelSevenAuthor = (author?: any) =>
  typeof author?.level === "number" && author.level >= 7;

export const getCommunityFeed = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const cursorFilter = buildCursorFilter(cursor);

  const postsPromise = Post.find(cursorFilter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate({ path: "author", select: authorProjection, match: authorLevelMatch })
    .lean();

  const reelsPromise = Reel.find(cursorFilter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate({ path: "author", select: authorProjection, match: authorLevelMatch })
    .lean();

  const [posts, reels] = await Promise.all([postsPromise, reelsPromise]);
  const levelSevenPosts = posts.filter((post) => isLevelSevenAuthor((post as any).author));
  const levelSevenReels = reels.filter((reel) => isLevelSevenAuthor((reel as any).author));

  const rawCombined = [...posts, ...reels].sort(
    (a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime()
  );

  const combined = [
    ...levelSevenPosts.map((post) => ({
      type: "post" as const,
      createdAt: post.createdAt,
      payload: serializePost(post as any, req.user?._id, { excerptLength: 240 })
    })),
    ...levelSevenReels.map((reel) => ({
      type: "reel" as const,
      createdAt: reel.createdAt,
      payload: serializeReel(reel as any, req.user?._id)
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const items = combined.slice(0, limit).map((item) => ({
    type: item.type,
    createdAt: item.createdAt,
    post: item.type === "post" ? item.payload : undefined,
    reel: item.type === "reel" ? item.payload : undefined
  }));

  const hasMore = rawCombined.length > limit;
  const cursorSource = hasMore ? rawCombined[limit - 1] : rawCombined[rawCombined.length - 1];
  const lastCreatedAt = cursorSource?.createdAt;
  const nextCursor = hasMore && lastCreatedAt ? new Date(lastCreatedAt as Date).toISOString() : null;

  res.json({ items, nextCursor });
};

const ensureObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

export const createCommunityPost = async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const { content, code, images } = req.body;

  const _id = new Types.ObjectId();
  const slug = await generateUniqueSlug(
    { slug: req.body.slug, title: undefined, content, fallbackId: _id.toString() },
    _id
  );

  const post = await Post.create({
    _id,
    content,
    code,
    images,
    author: req.user._id,
    categoryId: null,
    title: undefined,
    slug
  });

  await notifyMentions(content, req.user._id, post._id, undefined);
  await post.populate("author", authorProjection);

  res.status(201).json({ post: serializePost(post as any, req.user._id) });
};

export const replyToCommunityComment = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");

  const parentId = req.params.id;
  const { content, code, images } = req.body;
  ensureObjectId(parentId, "Invalid parent comment");

  const parent = await Comment.findById(parentId);
  if (!parent) throw new HttpError(404, "Parent comment not found");

  const comment = await Comment.create({
    postId: parent.postId,
    reelId: parent.reelId,
    content,
    code,
    images,
    parentId: parent._id,
    author: req.user._id
  });

  if (parent.postId) await Post.findByIdAndUpdate(parent.postId, { $inc: { commentsCount: 1 } });
  if (parent.reelId) await Reel.findByIdAndUpdate(parent.reelId, { $inc: { commentsCount: 1 } });
  parent.repliesCount = (parent.repliesCount ?? 0) + 1;
  await parent.save();

  await comment.populate("author", authorProjection);
  res.status(201).json({ comment: serializeComment(comment as any, req.user._id) });
};
