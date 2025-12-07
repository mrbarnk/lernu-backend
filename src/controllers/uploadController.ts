import { Request, Response } from "express";
import { uploadBufferToR2 } from "../utils/storage";
import { HttpError } from "../middleware/error";

const ensureFiles = (files?: Express.Multer.File[]) => {
  if (!files || !files.length) throw new HttpError(400, "No files provided");
  return files;
};

export const uploadImages = async (req: Request, res: Response) => {
  const files = ensureFiles(req.files as Express.Multer.File[]);
  if (files.length > 4) throw new HttpError(400, "Max 4 images");

  const urls = await Promise.all(
    files.map((file) =>
      uploadBufferToR2({
        prefix: "posts",
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype
      })
    )
  );

  res.status(201).json({ urls });
};

export const uploadProfileImage = async (req: Request, res: Response) => {
  const file = (req.file as Express.Multer.File) || null;
  if (!file) throw new HttpError(400, "No file provided");

  const url = await uploadBufferToR2({
    prefix: "profiles",
    buffer: file.buffer,
    originalName: file.originalname,
    contentType: file.mimetype
  });
  res.status(201).json({ url });
};

export const uploadCoverImage = async (req: Request, res: Response) => {
  const file = (req.file as Express.Multer.File) || null;
  if (!file) throw new HttpError(400, "No file provided");

  const url = await uploadBufferToR2({
    prefix: "covers",
    buffer: file.buffer,
    originalName: file.originalname,
    contentType: file.mimetype
  });
  res.status(201).json({ url });
};
