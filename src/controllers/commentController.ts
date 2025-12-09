import { Request, Response } from "express";
import { Types } from "mongoose";
import { Comment } from "../models/Comment";
import { Post } from "../models/Post";
import { Reel } from "../models/Reel";
import { Report } from "../models/Report";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeComment } from "../utils/serializers";
import { notifyMentions, notifyUser } from "../services/notificationService";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers";

const ensureValidObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};
const userRole = (req: Request) => req.user?.role ?? "user";
const canModerateRole = (role: string) => role === "moderator" || role === "admin";
const sameId = (a: Types.ObjectId | string, b: Types.ObjectId | string) =>
  a.toString() === b.toString();

export const getComments = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  ensureValidObjectId(req.params.id, "Invalid post");
  const filter = {
    postId: new Types.ObjectId(req.params.id),
    parentId: null,
    ...buildCursorFilter(cursor)
  };

  const comments = await Comment.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: comments.map((comment) => serializeComment(comment as any, req.user?._id)),
    nextCursor: getNextCursor(comments as any, limit)
  });
};

export const createComment = async (req: Request, res: Response) => {
  const { postId, content, code, images, parentId } = req.body;
  if (!req.user) throw new HttpError(401, "Authentication required");

  if (!postId && !req.body.reelId) throw new HttpError(400, "postId or reelId required");

  let post: any = null;
  let reel: any = null;

  if (postId) {
    ensureValidObjectId(postId, "Invalid post");
    post = await Post.findById(postId);
    if (!post) throw new HttpError(404, "Post not found");
  }

  if (req.body.reelId) {
    ensureValidObjectId(req.body.reelId, "Invalid reel");
    reel = await Reel.findById(req.body.reelId);
    if (!reel) throw new HttpError(404, "Reel not found");
  }

  let parentComment = null;
  if (parentId) {
    ensureValidObjectId(parentId, "Invalid parent comment");
    parentComment = await Comment.findById(parentId);
    if (!parentComment) throw new HttpError(404, "Parent comment not found");
    if (post && (!parentComment.postId || !parentComment.postId.equals(postId))) {
      throw new HttpError(400, "Parent comment mismatch");
    }
    if (reel && (!parentComment.reelId || !parentComment.reelId.equals(req.body.reelId))) {
      throw new HttpError(400, "Parent comment mismatch");
    }
  }

  const comment = await Comment.create({
    postId,
    reelId: req.body.reelId,
    content,
    code,
    images,
    parentId: parentId ?? null,
    author: req.user._id
  });

  if (postId) await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });
  if (reel) await Reel.findByIdAndUpdate(reel._id, { $inc: { commentsCount: 1 } });
  if (parentComment) {
    parentComment.repliesCount = (parentComment.repliesCount ?? 0) + 1;
    await parentComment.save();
  }

  await notifyUser({
    userId: post.author as any,
    actorId: req.user._id,
    type: "comment",
    postId: post._id,
    postTitle: post.title,
    commentId: comment._id
  });

  await notifyMentions(content, req.user._id, post._id, post.title || undefined);
  await comment.populate("author", authorProjection);

  res.status(201).json({ comment: serializeComment(comment as any, req.user._id) });
};

const canModerate = (role: string) => role === "moderator" || role === "admin";

export const updateComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id).populate("author", authorProjection);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const isAuthor = sameId(comment.author as Types.ObjectId, req.user._id);
  const role = userRole(req);
  if (!isAuthor && !canModerateRole(role)) throw new HttpError(403, "Forbidden");

  const { isAccepted, ...fields } = req.body;
  Object.assign(comment, fields);
  if (isAccepted !== undefined && canModerateRole(role)) {
    comment.isAccepted = isAccepted;
  }
  comment.isEdited = true;
  await comment.save();

  res.json({ comment: serializeComment(comment as any, req.user._id) });
};

export const deleteComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const isAuthor = sameId(comment.author as Types.ObjectId, req.user._id);
  if (!isAuthor && !canModerateRole(userRole(req))) throw new HttpError(403, "Forbidden");

  await comment.deleteOne();
  await Post.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } });
  await Reel.findByIdAndUpdate(comment.reelId, { $inc: { commentsCount: -1 } });
  if (comment.parentId) {
    await Comment.findByIdAndUpdate(comment.parentId, { $inc: { repliesCount: -1 } });
  }
  res.json({ message: "Comment deleted" });
};

export const likeComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id).populate("author", authorProjection);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const likedBy = comment.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.addToSet(req.user._id);
  comment.likes = likedBy.length;
  await comment.save();

  await notifyUser({
    userId: comment.author as any,
    actorId: req.user._id,
    type: "like",
    postId: comment.postId as Types.ObjectId,
    commentId: comment._id
  });

  res.json({ comment: serializeComment(comment as any, req.user._id) });
};

export const unlikeComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id).populate("author", authorProjection);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const likedBy = comment.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.pull(req.user._id);
  comment.likes = likedBy.length;
  await comment.save();

  res.json({ comment: serializeComment(comment as any, req.user._id) });
};

export const acceptComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  const post = await Post.findById(comment.postId);
  if (!post) throw new HttpError(404, "Post not found");

  const isPostAuthor = sameId(post.author as Types.ObjectId, req.user._id);
  if (!isPostAuthor && !canModerateRole(userRole(req))) throw new HttpError(403, "Forbidden");

  comment.isAccepted = true;
  await comment.save();
  post.isSolved = true;
  await post.save();

  res.json({ comment: serializeComment(comment as any, req.user._id) });
};

export const reportComment = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  await Report.create({
    targetType: "comment",
    targetId: req.params.id,
    reporter: req.user._id,
    reason: req.body?.reason
  });
  res.status(201).json({ message: "Report submitted" });
};

export const getCommentReplies = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const filter = {
    parentId: new Types.ObjectId(req.params.id),
    ...buildCursorFilter(cursor)
  };

  const replies = await Comment.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: replies.map((reply) => serializeComment(reply as any, req.user?._id)),
    nextCursor: getNextCursor(replies as any, limit)
  });
};
