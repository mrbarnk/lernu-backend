import { Router } from "express";
import {
  acceptComment,
  createComment,
  deleteComment,
  getComments,
  likeComment,
  reportComment,
  unlikeComment,
  updateComment
} from "../controllers/commentController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { commentsCursorSchema, createCommentSchema, updateCommentSchema } from "../schemas/commentSchemas";

const router = Router();

router.get("/posts/:id/comments", optionalAuth, validate(commentsCursorSchema), getComments);
router.post("/comments", requireAuth, validate(createCommentSchema), createComment);
router.patch("/comments/:id", requireAuth, validate(updateCommentSchema), updateComment);
router.delete("/comments/:id", requireAuth, deleteComment);
router.post("/comments/:id/like", requireAuth, likeComment);
router.delete("/comments/:id/like", requireAuth, unlikeComment);
router.post("/comments/:id/accept", requireAuth, acceptComment);
router.post("/comments/:id/report", requireAuth, reportComment);

export default router;
