import { Request, Response } from "express";
import { Types } from "mongoose";
import { Comment } from "../models/Comment";
import { Reel } from "../models/Reel";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeComment } from "../utils/serializers";
import { notifyCommentParticipants } from "../services/notificationService";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const ensureObjectId = (value: string, message = "Invalid id") => {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, message);
};

export const getReelComments = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  ensureObjectId(req.params.id, "Invalid reel");
  const filter = {
    reelId: new Types.ObjectId(req.params.id),
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

export const addReelComment = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { content, code, images, parentId } = req.body;
  const reelId = req.params.id;
  ensureObjectId(reelId, "Invalid reel");
  const reel = await Reel.findById(reelId);
  if (!reel) throw new HttpError(404, "Reel not found");

  let parentComment = null;
  if (parentId) {
    ensureObjectId(parentId, "Invalid parent comment");
    parentComment = await Comment.findById(parentId);
    if (!parentComment || !parentComment.reelId?.equals(reelId)) {
      throw new HttpError(400, "Parent comment mismatch");
    }
  }

  const comment = await Comment.create({
    reelId,
    content,
    code,
    images,
    parentId: parentId ?? null,
    author: req.user._id
  });

  await Reel.findByIdAndUpdate(reelId, { $inc: { commentsCount: 1 } });
  if (parentComment) {
    parentComment.repliesCount = (parentComment.repliesCount ?? 0) + 1;
    await parentComment.save();
  }

  await notifyCommentParticipants({
    actor: req.user,
    comment: { _id: comment._id, content: comment.content },
    reel: {
      _id: reel._id,
      title: reel.title,
      author: reel.author as any,
      createdAt: reel.createdAt
    },
    parentCommentAuthorId: parentComment?.author as any
  });

  await comment.populate("author", authorProjection);
  res.status(201).json({ comment: serializeComment(comment as any, req.user._id) });
};
