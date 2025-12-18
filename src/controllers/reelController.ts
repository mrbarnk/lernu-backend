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

const canModerateRole = (role?: string) => role === "admin" || role === "moderator";
const hasLevelSeven = (user?: Request["user"]) =>
  typeof user?.level === "number" && user.level >= 7;
const getAuthorId = (entity: any) =>
  typeof entity.author === "object" && entity.author
    ? (entity.author as any)._id ?? (entity.author as any)
    : entity.author;
const canViewReel = (reel: any, req: Request) => {
  if (reel?.isVisible !== false) return true;
  if (!req.user) return false;
  if (canModerateRole(req.user.role)) return true;
  const authorId = getAuthorId(reel);
  return authorId ? authorId.toString() === req.user._id.toString() : false;
};
const visibilityFilter = (req: Request) => {
  if (canModerateRole(req.user?.role)) return null;
  if (req.user) return { $or: [{ isVisible: { $ne: false } }, { author: req.user._id }] };
  return { isVisible: { $ne: false } };
};

export const listReels = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const search = (req.query.search as string) || "";
  const baseFilter: any = { ...buildCursorFilter(cursor) };
  if (search) baseFilter.$text = { $search: search };
  const visibility = visibilityFilter(req);
  const filter = visibility ? { $and: [baseFilter, visibility] } : baseFilter;

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
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
  res.json({ reel: serializeReel(reel as any, req.user?._id) });
};

export const viewReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const watchedSeconds =
    typeof req.body?.watchedSeconds === "number" ? req.body.watchedSeconds : 0;
  const reel = await Reel.findById(req.params.id).populate("author", authorProjection);
  if (!reel) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
  reel.views = (reel.views ?? 0) + 1;
  reel.totalWatchSeconds = (reel.totalWatchSeconds ?? 0) + watchedSeconds;
  reel.lastViewedAt = new Date();
  await reel.save();
  await ReelView.create({
    reelId: reel._id,
    userId: req.user?._id,
    watchedSeconds
  });
  res.json({ reel: serializeReel(reel.toObject() as any, req.user?._id) });
};

export const createReel = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const canSetVisibility = hasLevelSeven(req.user) || canModerateRole(req.user.role);
  const { isVisible, ...fields } = req.body;
  const visibility =
    canSetVisibility && typeof isVisible === "boolean" ? isVisible : true;
  const reel = await Reel.create({
    ...fields,
    isVisible: visibility,
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
  const { isVisible, ...fields } = req.body;
  const canChangeVisibility = canModerateRole(req.user.role) || (isAuthor && hasLevelSeven(req.user));
  if (isVisible !== undefined && !canChangeVisibility) {
    throw new HttpError(403, "Only moderators or authors with level 7+ can change visibility");
  }
  Object.assign(reel, fields);
  if (isVisible !== undefined) reel.isVisible = isVisible;
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
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
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
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
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
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
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
  if (!canViewReel(reel, req)) throw new HttpError(403, "Reel is not viewable");
  const bookmarked = reel.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.pull(req.user._id);
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};
