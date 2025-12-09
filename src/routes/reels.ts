import { Router } from "express";
import {
  bookmarkReel,
  createReel,
  deleteReel,
  getReel,
  likeReel,
  listReels,
  viewReel,
  unbookmarkReel,
  unlikeReel,
  updateReel
} from "../controllers/reelController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createReelSchema,
  reelCursorSchema,
  updateReelSchema,
  viewReelSchema
} from "../schemas/reelSchemas";

const router = Router();

router.get("/", optionalAuth, validate(reelCursorSchema), listReels);
router.get("/:id", optionalAuth, getReel);
router.post("/", requireAuth, validate(createReelSchema), createReel);
router.patch("/:id", requireAuth, validate(updateReelSchema), updateReel);
router.delete("/:id", requireAuth, deleteReel);
router.post("/:id/view", optionalAuth, validate(viewReelSchema), viewReel);
router.post("/:id/like", requireAuth, likeReel);
router.delete("/:id/like", requireAuth, unlikeReel);
router.post("/:id/bookmark", requireAuth, bookmarkReel);
router.delete("/:id/bookmark", requireAuth, unbookmarkReel);

export default router;
