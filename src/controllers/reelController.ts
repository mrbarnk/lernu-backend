import { Request, Response } from "express";
import { Types } from "mongoose";
import { Reel } from "../models/Reel";
import { ReelView } from "../models/ReelView";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeReel } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const ensureObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
};

export const listReels = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const search = (req.query.search as string) || "";
  const filter: any = { ...buildCursorFilter(cursor) };
  if (search) filter.$text = { $search: search };

  const reels = await Reel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("author", authorProjection)
    .lean();

  res.json({
    items: reels.map((r) => serializeReel(r as any, req.user?._id)),
    nextCursor: getNextCursor(reels as any, limit)
  });
};

export const getReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection).lean();
  if (!reel) throw new HttpError(404, "Reel not found");
  res.json({ reel: serializeReel(reel as any, req.user?._id) });
};

export const viewReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const watchedSeconds =
    typeof req.body?.watchedSeconds === "number" ? req.body.watchedSeconds : 0;
  const reel = await Reel.findByIdAndUpdate(
    req.params.id,
    { $inc: { views: 1, totalWatchSeconds: watchedSeconds }, $set: { lastViewedAt: new Date() } },
    { new: true }
  )
    .populate("author", authorProjection)
    .lean();
  if (!reel) throw new HttpError(404, "Reel not found");
  await ReelView.create({
    reelId: reel._id,
    userId: req.user?._id,
    watchedSeconds
  });
  res.json({ reel: serializeReel(reel as any, req.user?._id) });
};

export const createReel = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.create({
    ...req.body,
    author: req.user._id
  });
  await reel.populate("author", authorProjection);
  res.status(201).json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const updateReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id);
  if (!reel) throw new HttpError(404, "Reel not found");
  const isAuthor = reel.author.toString() === req.user._id.toString();
  if (!isAuthor && req.user.role !== "admin" && req.user.role !== "moderator") {
    throw new HttpError(403, "Forbidden");
  }
  Object.assign(reel, req.body);
  await reel.save();
  await reel.populate("author", authorProjection);
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const deleteReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id);
  if (!reel) throw new HttpError(404, "Reel not found");
  const isAuthor = reel.author.toString() === req.user._id.toString();
  if (!isAuthor && req.user.role !== "admin" && req.user.role !== "moderator") {
    throw new HttpError(403, "Forbidden");
  }
  await reel.deleteOne();
  res.json({ message: "Reel deleted" });
};

export const likeReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection);
  if (!reel) throw new HttpError(404, "Reel not found");
  const likedBy = reel.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.addToSet(req.user._id);
  reel.likes = likedBy.length;
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const unlikeReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection);
  if (!reel) throw new HttpError(404, "Reel not found");
  const likedBy = reel.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.pull(req.user._id);
  reel.likes = likedBy.length;
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const bookmarkReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection);
  if (!reel) throw new HttpError(404, "Reel not found");
  const bookmarked = reel.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.addToSet(req.user._id);
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const unbookmarkReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection);
  if (!reel) throw new HttpError(404, "Reel not found");
  const bookmarked = reel.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.pull(req.user._id);
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};
