import { Router } from "express";
import {
  bookmarkPost,
  createPost,
  deletePost,
  getPost,
  likePost,
  listPosts,
  reportPost,
  sharePost,
  trendingPosts,
  unbookmarkPost,
  unlikePost,
  updatePost
} from "../controllers/postController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createPostSchema, cursorSchema, updatePostSchema } from "../schemas/postSchemas";

const router = Router();

router.get("/", optionalAuth, validate(cursorSchema), listPosts);
router.get("/trending", optionalAuth, trendingPosts);
router.get("/:id", optionalAuth, getPost);
router.post("/", requireAuth, validate(createPostSchema), createPost);
router.patch("/:id", requireAuth, validate(updatePostSchema), updatePost);
router.delete("/:id", requireAuth, deletePost);
router.post("/:id/like", requireAuth, likePost);
router.delete("/:id/like", requireAuth, unlikePost);
router.post("/:id/bookmark", requireAuth, bookmarkPost);
router.delete("/:id/bookmark", requireAuth, unbookmarkPost);
router.post("/:id/share", sharePost);
router.post("/:id/report", requireAuth, reportPost);

export default router;
