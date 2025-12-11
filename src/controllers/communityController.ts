import { Request, Response } from "express";
import { Post } from "../models/Post";
import { Reel } from "../models/Reel";
import { notifyMentions } from "../services/notificationService";
import { buildCursorFilter, parsePagination } from "../utils/pagination";
import { serializePost, serializeReel } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const titleMissingFilter = { $or: [{ title: { $exists: false } }, { title: null }, { title: "" }] };
const uncategorizedFilter = { $or: [{ categoryId: { $exists: false } }, { categoryId: null }] };

export const getCommunityFeed = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const cursorFilter = buildCursorFilter(cursor);

  const postsPromise = Post.find({ ...cursorFilter, $and: [titleMissingFilter, uncategorizedFilter] })
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate("author", authorProjection)
    .lean();

  const reelsPromise = Reel.find(cursorFilter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate("author", authorProjection)
    .lean();

  const [posts, reels] = await Promise.all([postsPromise, reelsPromise]);

  const combined = [
    ...posts.map((post) => ({
      type: "post" as const,
      createdAt: post.createdAt,
      payload: serializePost(post as any, req.user?._id, { excerptLength: 240 })
    })),
    ...reels.map((reel) => ({
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

  const hasMore = combined.length > limit;
  const lastCreatedAt = items[items.length - 1]?.createdAt;
  const nextCursor = hasMore && lastCreatedAt ? new Date(lastCreatedAt as Date).toISOString() : null;

  res.json({ items, nextCursor });
};

export const createCommunityPost = async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const { content, code, images } = req.body;

  const post = await Post.create({
    content,
    code,
    images,
    author: req.user._id,
    categoryId: null,
    title: undefined
  });

  await notifyMentions(content, req.user._id, post._id, undefined);
  await post.populate("author", authorProjection);

  res.status(201).json({ post: serializePost(post as any, req.user._id) });
};
