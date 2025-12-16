import { Router } from "express";
import {
  generateScript,
  generateVideoFromScriptHandler,
  listVideoGenerations,
  processVideoGeneration,
  videoGenerationStatus
} from "../controllers/aiController";
import {
  addConversationMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation
} from "../controllers/aiConversationController";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  addConversationMessageSchema,
  createConversationSchema,
  deleteConversationSchema,
  generateScriptSchema,
  getConversationSchema,
  listConversationsSchema,
  updateConversationSchema,
  videoFromScriptSchema,
  listVideoGenerationsSchema,
  processVideoSchema
} from "../schemas/aiSchemas";

const router = Router();

router.post("/script", requireAuth, validate(generateScriptSchema), generateScript);
router.post(
  "/video-from-script",
  requireAuth,
  validate(videoFromScriptSchema),
  generateVideoFromScriptHandler
);

router.get("/videos", requireAuth, validate(listVideoGenerationsSchema), listVideoGenerations);
router.post(
  "/videos/:id/process",
  requireAuth,
  validate(processVideoSchema),
  processVideoGeneration
);
router.get(
  "/videos/:id/status",
  requireAuth,
  validate(processVideoSchema),
  videoGenerationStatus
);

router.get("/conversations", requireAuth, validate(listConversationsSchema), listConversations);
router.post("/conversations", requireAuth, validate(createConversationSchema), createConversation);
router.get("/conversations/:id", requireAuth, validate(getConversationSchema), getConversation);
router.patch(
  "/conversations/:id",
  requireAuth,
  validate(updateConversationSchema),
  updateConversation
);
router.delete(
  "/conversations/:id",
  requireAuth,
  validate(deleteConversationSchema),
  deleteConversation
);
router.post(
  "/conversations/:id/messages",
  requireAuth,
  validate(addConversationMessageSchema),
  addConversationMessage
);

export default router;
