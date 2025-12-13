import { Router } from "express";
import {
  generateScript,
  generateVideoFromScriptHandler,
  listVideoGenerations
} from "../controllers/aiController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  generateScriptSchema,
  videoFromScriptSchema,
  listVideoGenerationsSchema
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

export default router;
