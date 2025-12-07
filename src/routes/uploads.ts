import { Router } from "express";
import { uploadCoverImage, uploadImages, uploadProfileImage } from "../controllers/uploadController";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/images", requireAuth, upload.array("images", 4), uploadImages);
router.post("/profile", requireAuth, upload.single("image"), uploadProfileImage);
router.post("/cover", requireAuth, upload.single("image"), uploadCoverImage);

export default router;
