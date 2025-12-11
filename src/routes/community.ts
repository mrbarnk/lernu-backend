import { Router } from "express";
import {
  createCommunityPost,
  getCommunityFeed,
  replyToCommunityComment
} from "../controllers/communityController";
import {
  createComment,
  getCommentReplies,
  getComments
} from "../controllers/commentController";
import { addReelComment, getReelComments } from "../controllers/reelCommentController";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  commentRepliesSchema,
  commentsCursorSchema,
  createCommentSchema,
  createReelCommentSchema
} from "../schemas/commentSchemas";
import {
  communityCursorSchema,
  communityPostSchema,
  communityReplySchema
} from "../schemas/communitySchemas";

const router = Router();

router.get("/", optionalAuth, validate(communityCursorSchema), getCommunityFeed);
router.post("/posts", requireAuth, validate(communityPostSchema), createCommunityPost);
router.get("/posts/:id/comments", optionalAuth, validate(commentsCursorSchema), getComments);
router.post(
  "/posts/:id/comments",
  requireAuth,
  (req, _res, next) => {
    req.body.postId = req.params.id;
    next();
  },
  validate(createCommentSchema),
  createComment
);
router.get("/reels/:id/comments", optionalAuth, validate(commentsCursorSchema), getReelComments);
router.post(
  "/reels/:id/comments",
  requireAuth,
  (req, _res, next) => {
    req.body.reelId = req.params.id;
    next();
  },
  validate(createReelCommentSchema),
  addReelComment
);
router.get(
  "/comments/:id/replies",
  optionalAuth,
  validate(commentRepliesSchema),
  getCommentReplies
);
router.post(
  "/comments/:id/replies",
  requireAuth,
  validate(communityReplySchema),
  replyToCommunityComment
);

export default router;
