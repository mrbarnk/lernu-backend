import { Request, Response } from "express";
import { Types } from "mongoose";
import { Reel } from "../models/Reel";
import { ReelView } from "../models/ReelView";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeReel } from "../utils/serializers";

const authorProjection =
  "email username displayName avatar coverPhoto bio joinedAt level isOnline role followers badges";

const authorLevelMatch = { level: { $gte: 7 } };
const isLevelSevenAuthor = (author?: any) =>
  typeof author?.level === "number" && author.level >= 7;

const ensureObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
};

const canModerateRole = (role?: string) => role === "admin" || role === "moderator";
const hasLevelSeven = (user?: Request["user"]) =>
  typeof user?.level === "number" && user.level >= 7;
const canViewReel = (reel: any) =>
  reel?.isVisible !== false && reel?.isVisible !== "false" && reel?.isVisible !== 0;
const visibilityFilter = () => ({
  $or: [{ isVisible: { $exists: false } }, { isVisible: true }]
});
const canPinReel = (req: Request, isAuthor: boolean) =>
  canModerateRole(req.user?.role) || (isAuthor && hasLevelSeven(req.user));

export const listReels = async (req: Request, res: Response) => {
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const search = (req.query.search as string) || "";
  const baseFilter: any = { ...buildCursorFilter(cursor) };
  if (search) baseFilter.$text = { $search: search };
  const visibility = visibilityFilter();
  const filter = { $and: [baseFilter, visibility] };

  const reels = await Reel.find(filter)
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit)
    .populate({ path: "author", select: authorProjection, match: authorLevelMatch })
    .lean();

  const levelSevenReels = reels.filter((reel) => isLevelSevenAuthor((reel as any).author));

  res.json({
    items: levelSevenReels.map((r) => serializeReel(r as any, req.user?._id)),
    nextCursor: getNextCursor(reels as any, limit)
  });
};

export const getReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const reel = await Reel.findById(req.params.id)
    .populate({ path: "author", select: authorProjection, match: authorLevelMatch })
    .lean();
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
  res.json({ reel: serializeReel(reel as any, req.user?._id) });
};

export const viewReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  const watchedSeconds =
    typeof req.body?.watchedSeconds === "number" ? req.body.watchedSeconds : 0;
  const reel = await Reel.findById(req.params.id).populate({
    path: "author",
    select: authorProjection,
    match: authorLevelMatch
  });
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
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
  const { isVisible, isPinned, ...fields } = req.body;
  const visibility =
    canSetVisibility && typeof isVisible === "boolean" ? isVisible : true;
  const pinValue = canPinReel(req, true) && typeof isPinned === "boolean" ? isPinned : false;
  const reel = await Reel.create({
    ...fields,
    isVisible: visibility,
    isPinned: pinValue,
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
  const { isVisible, isPinned, ...fields } = req.body;
  const canChangeVisibility = canModerateRole(req.user.role) || (isAuthor && hasLevelSeven(req.user));
  const canPin = canPinReel(req, isAuthor);
  if (isVisible !== undefined && !canChangeVisibility) {
    throw new HttpError(403, "Only moderators or authors with level 7+ can change visibility");
  }
  if (isPinned !== undefined && !canPin) {
    throw new HttpError(403, "Only moderators or authors with level 7+ can pin reels");
  }
  Object.assign(reel, fields);
  if (isVisible !== undefined) reel.isVisible = isVisible;
  if (isPinned !== undefined) reel.isPinned = isPinned;
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
  const reel = await Reel.findById(req.params.id).populate({
    path: "author",
    select: authorProjection,
    match: authorLevelMatch
  });
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
  const likedBy = reel.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.addToSet(req.user._id);
  reel.likes = likedBy.length;
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const unlikeReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate({
    path: "author",
    select: authorProjection,
    match: authorLevelMatch
  });
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
  const likedBy = reel.likedBy as unknown as Types.Array<Types.ObjectId>;
  likedBy.pull(req.user._id);
  reel.likes = likedBy.length;
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const bookmarkReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate({
    path: "author",
    select: authorProjection,
    match: authorLevelMatch
  });
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
  const bookmarked = reel.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.addToSet(req.user._id);
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};

export const unbookmarkReel = async (req: Request, res: Response) => {
  ensureObjectId(req.params.id);
  if (!req.user) throw new HttpError(401, "Authentication required");
  const reel = await Reel.findById(req.params.id).populate({
    path: "author",
    select: authorProjection,
    match: authorLevelMatch
  });
  if (!reel || !isLevelSevenAuthor((reel as any).author)) throw new HttpError(404, "Reel not found");
  if (!canViewReel(reel)) throw new HttpError(404, "Reel not found");
  const bookmarked = reel.bookmarkedBy as unknown as Types.Array<Types.ObjectId>;
  bookmarked.pull(req.user._id);
  await reel.save();
  res.json({ reel: serializeReel(reel.toObject() as any, req.user._id) });
};
