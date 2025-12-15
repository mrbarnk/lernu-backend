import { Router } from "express";
import {
  generateScript,
  generateVideoFromScriptHandler,
  listVideoGenerations,
  processVideoGeneration,
  videoGenerationStatus
} from "../controllers/aiController";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  generateScriptSchema,
  videoFromScriptSchema,
  listVideoGenerationsSchema,
  processVideoSchema
} from "../schemas/aiSchemas";

const router = Router();

router.post("/script", optionalAuth, validate(generateScriptSchema), generateScript);
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

export default router;
