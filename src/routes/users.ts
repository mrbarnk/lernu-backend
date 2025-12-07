import { Router } from "express";
import {
  followUser,
  getUserPosts,
  getUserProfile,
  searchUsers,
  unfollowUser,
  updateUser
} from "../controllers/userController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { searchUsersSchema, updateUserSchema, userIdParamSchema } from "../schemas/userSchemas";

const router = Router();

router.get("/search", validate(searchUsersSchema), searchUsers);
router.get("/:id", optionalAuth, validate(userIdParamSchema), getUserProfile);
router.get("/:id/posts", optionalAuth, getUserPosts);
router.patch("/:id", requireAuth, validate(updateUserSchema), updateUser);
router.post("/:id/follow", requireAuth, followUser);
router.delete("/:id/follow", requireAuth, unfollowUser);

export default router;
