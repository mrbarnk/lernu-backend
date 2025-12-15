import { Router } from "express";
import {
  followUser,
  getOnlineUsersList,
  getUserPosts,
  getUserProfile,
  getUserPostsByUsername,
  getUserProfileByUsername,
  searchUsers,
  unfollowUser,
  updateUser
} from "../controllers/userController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  searchUsersSchema,
  updateUserSchema,
  userIdParamSchema,
  usernameParamSchema
} from "../schemas/userSchemas";

const router = Router();

router.get("/search", validate(searchUsersSchema), searchUsers);
router.get("/online", optionalAuth, getOnlineUsersList);
router.get("/by-username/:username", optionalAuth, validate(usernameParamSchema), getUserProfileByUsername);
router.get("/by-username/:username/posts", optionalAuth, validate(usernameParamSchema), getUserPostsByUsername);
router.get("/:id", optionalAuth, validate(userIdParamSchema), getUserProfile);
router.get("/:id/posts", optionalAuth, getUserPosts);
router.patch("/:id", requireAuth, validate(updateUserSchema), updateUser);
router.post("/:id/follow", requireAuth, followUser);
router.delete("/:id/follow", requireAuth, unfollowUser);

export default router;
