import { Router } from "express";
import { generateScript, generateVideoFromScriptHandler } from "../controllers/aiController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { generateScriptSchema, videoFromScriptSchema } from "../schemas/aiSchemas";

const router = Router();

router.post("/script", requireAuth, validate(generateScriptSchema), generateScript);
router.post(
  "/video-from-script",
  requireAuth,
  validate(videoFromScriptSchema),
  generateVideoFromScriptHandler
);

export default router;
