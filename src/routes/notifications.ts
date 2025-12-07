import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../controllers/notificationController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { notificationReadSchema, notificationsCursorSchema } from "../schemas/notificationSchemas";

const router = Router();

router.get("/", requireAuth, validate(notificationsCursorSchema), listNotifications);
router.post("/:id/read", requireAuth, validate(notificationReadSchema), markNotificationRead);
router.post("/read-all", requireAuth, markAllNotificationsRead);

export default router;
