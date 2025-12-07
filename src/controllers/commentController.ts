import { Request, Response } from "express";
import { Types } from "mongoose";
import { Comment } from "../models/Comment";
import { Post } from "../models/Post";
import { Report } from "../models/Report";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeComment } from "../utils/serializers";
import { notifyMentions, notifyUser } from "../services/notificationService";

const authorProjection =
  "email username displayName avatar bio joinedAt level isOnline role";

const ensureValidObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

export const getComments = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  ensureValidObjectId(req.params.id, "Invalid post");
  const filter = { postId: new Types.ObjectId(req.params.id), ...buildCursorFilter(cursor) };

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
  const { postId, content, code, images } = req.body;
  if (!req.user) throw new HttpError(401, "Authentication required");

  ensureValidObjectId(postId, "Invalid post");
  const post = await Post.findById(postId);
  if (!post) throw new HttpError(404, "Post not found");

  const comment = await Comment.create({
    postId,
    content,
    code,
    images,
    author: req.user._id
  });

  await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });

  await notifyUser({
    userId: post.author as any,
    actorId: req.user._id,
    type: "comment",
    postId: post._id,
    postTitle: post.title
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

  const isAuthor = (comment.author as any as Types.ObjectId).equals(req.user._id);
  if (!isAuthor && !canModerate(req.user.role)) throw new HttpError(403, "Forbidden");

  const { isAccepted, ...fields } = req.body;
  Object.assign(comment, fields);
  if (isAccepted !== undefined && canModerate(req.user.role)) {
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

  const isAuthor = comment.author.equals(req.user._id);
  if (!isAuthor && !canModerate(req.user.role)) throw new HttpError(403, "Forbidden");

  await comment.deleteOne();
  await Post.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } });
  res.json({ message: "Comment deleted" });
};

export const likeComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id).populate("author", authorProjection);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  comment.likedBy.addToSet(req.user._id);
  comment.likes = comment.likedBy.length;
  await comment.save();

  await notifyUser({
    userId: comment.author as any,
    actorId: req.user._id,
    type: "like",
    postId: comment.postId as Types.ObjectId
  });

  res.json({ comment: serializeComment(comment as any, req.user._id) });
};

export const unlikeComment = async (req: Request, res: Response) => {
  ensureValidObjectId(req.params.id, "Invalid comment id");
  const comment = await Comment.findById(req.params.id).populate("author", authorProjection);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (!req.user) throw new HttpError(401, "Authentication required");

  comment.likedBy.pull(req.user._id);
  comment.likes = comment.likedBy.length;
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

  const isPostAuthor = post.author.equals(req.user._id);
  if (!isPostAuthor && !canModerate(req.user.role)) throw new HttpError(403, "Forbidden");

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
