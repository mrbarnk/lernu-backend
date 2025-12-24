import { Router } from "express";
import {
  getSitemap,
  getSitemapIndex,
  getPostsSitemap,
  getCategoriesSitemap,
  getPagesSitemap
} from "../controllers/sitemapController";

const router = Router();

router.get("/sitemap.xml", getSitemapIndex);
router.get("/sitemaps/posts.xml", getPostsSitemap);
router.get("/sitemaps/categories.xml", getCategoriesSitemap);
router.get("/sitemaps/pages.xml", getPagesSitemap);

export default router;
