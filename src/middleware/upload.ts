import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(),
  // Allow larger uploads to avoid "file too large" errors (25MB per file, max 4 files)
  limits: { fileSize: 100 * 1024 * 1024, files: 4 }
});
