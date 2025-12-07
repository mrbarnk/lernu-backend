import { Router } from "express";
import { getSitemap } from "../controllers/sitemapController";

const router = Router();

router.get("/sitemap.xml", getSitemap);

export default router;
