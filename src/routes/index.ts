import { Express } from "express";
import authRoutes from "./auth";
import categoryRoutes from "./categories";
import postRoutes from "./posts";
import commentRoutes from "./comments";
import notificationRoutes from "./notifications";
import userRoutes from "./users";
import statsRoutes from "./stats";
import uploadRoutes from "./uploads";
import docsRoutes from "./docs";
import sitemapRoutes from "./sitemap";
import searchRoutes from "./search";
import reelRoutes from "./reels";

export const registerRoutes = (app: Express) => {
  app.use("/docs", docsRoutes);
  app.use(sitemapRoutes);
  app.use(searchRoutes);
  app.use("/auth", authRoutes);
  app.use("/categories", categoryRoutes);
  app.use("/reels", reelRoutes);
  app.use("/posts", postRoutes);
  app.use(commentRoutes);
  app.use("/notifications", notificationRoutes);
  app.use("/users", userRoutes);
  app.use("/stats", statsRoutes);
  app.use("/uploads", uploadRoutes);
};
