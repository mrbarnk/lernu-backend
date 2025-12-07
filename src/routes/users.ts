import { Router } from "express";
import { getUserPosts, getUserProfile, updateUser } from "../controllers/userController";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { updateUserSchema, userIdParamSchema } from "../schemas/userSchemas";

const router = Router();

router.get("/:id", optionalAuth, validate(userIdParamSchema), getUserProfile);
router.get("/:id/posts", optionalAuth, getUserPosts);
router.patch("/:id", requireAuth, validate(updateUserSchema), updateUser);

export default router;
