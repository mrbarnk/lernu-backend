import { Router } from "express";
import { createCommunityPost, getCommunityFeed } from "../controllers/communityController";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { communityCursorSchema, communityPostSchema } from "../schemas/communitySchemas";

const router = Router();

router.get("/", optionalAuth, validate(communityCursorSchema), getCommunityFeed);
router.post("/posts", requireAuth, validate(communityPostSchema), createCommunityPost);

export default router;
