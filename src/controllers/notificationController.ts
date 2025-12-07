import { Request, Response } from "express";
import { Notification } from "../models/Notification";
import { HttpError } from "../middleware/error";
import { buildCursorFilter, getNextCursor, parsePagination } from "../utils/pagination";
import { serializeNotification } from "../utils/serializers";

const actorProjection = "username displayName avatar";

export const listNotifications = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { limit, cursor } = parsePagination(req.query, 10, 50);
  const unreadOnly = String(req.query.unreadOnly ?? "").toLowerCase() === "true";

  const filter: Record<string, unknown> = { user: req.user._id, ...buildCursorFilter(cursor) };
  if (unreadOnly) filter.isRead = false;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("actor", actorProjection)
    .lean();

  res.json({
    items: notifications.map((n) => serializeNotification(n as any)),
    nextCursor: getNextCursor(notifications as any, limit)
  });
};

export const markNotificationRead = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true }
  );
  res.json({ message: "Notification read" });
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  res.json({ message: "All notifications read" });
};
