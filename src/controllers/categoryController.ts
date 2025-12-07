import { Request, Response } from "express";
import { Category } from "../models/Category";

export const getCategories = async (_req: Request, res: Response) => {
  const categories = (await Category.find().lean()).map(cat => ({
    id: cat._id,
    ...cat
  }));
  res.json({ categories });
};
