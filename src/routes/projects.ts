import { Router } from "express";
import {
  addScene,
  createProject,
  deleteScene,
  deleteProject,
  generateScenes,
  generateProjectVideo,
  getProjectVideoStatus,
  getProject,
  listProjects,
  regenerateScene,
  reorderScenes,
  updateProject,
  updateScene,
  getProjectPreviewStatus
} from "../controllers/projectController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  addSceneSchema,
  createProjectSchema,
  generateScenesSchema,
  getProjectSchema,
  listProjectsSchema,
  regenerateSceneSchema,
  reorderScenesSchema,
  videoStatusSchema,
  generateVideoSchema,
  updateProjectSchema,
  updateSceneSchema,
  generateSceneAudioSchema,
  generatePreviewSchema
} from "../schemas/projectSchemas";
import { generateSceneAudio, generateProjectPreview } from "../controllers/projectController";

const router = Router();

router.post("/generate-scenes", requireAuth, validate(generateScenesSchema), generateScenes);
router.post("/:projectId/video", requireAuth, validate(generateVideoSchema), generateProjectVideo);
router.post(
  "/:projectId/preview",
  requireAuth,
  validate(generatePreviewSchema),
  generateProjectPreview
);
router.get("/:projectId/preview/status", requireAuth, getProjectPreviewStatus);
router.get("/:projectId/video/status", requireAuth, validate(videoStatusSchema), getProjectVideoStatus);
router.get("/", requireAuth, validate(listProjectsSchema), listProjects);
router.post("/", requireAuth, validate(createProjectSchema), createProject);
router.get("/:id", requireAuth, validate(getProjectSchema), getProject);
router.patch("/:id", requireAuth, validate(updateProjectSchema), updateProject);
router.delete("/:id", requireAuth, deleteProject);
router.post("/:projectId/scenes", requireAuth, validate(addSceneSchema), addScene);
router.put(
  "/:projectId/scenes/reorder",
  requireAuth,
  validate(reorderScenesSchema),
  reorderScenes
);
router.patch(
  "/:projectId/scenes/:sceneId",
  requireAuth,
  validate(updateSceneSchema),
  updateScene
);
router.delete("/:projectId/scenes/:sceneId", requireAuth, deleteScene);
router.post(
  "/:projectId/scenes/:sceneId/regenerate",
  requireAuth,
  validate(regenerateSceneSchema),
  regenerateScene
);
router.post(
  "/:projectId/scenes/:sceneId/audio",
  requireAuth,
  validate(generateSceneAudioSchema),
  generateSceneAudio
);

export default router;
