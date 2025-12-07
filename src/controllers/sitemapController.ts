import { Request, Response } from "express";
import { env } from "../config/env";
import { Post } from "../models/Post";
import { slugify } from "../utils/slug";

export const getSitemap = async (_req: Request, res: Response) => {
  const posts = await Post.find({}, "title createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const base = env.clientUrl.replace(/\/+$/, "");
  const urls = posts.map((post) => {
    const slug = post.title ? slugify(post.title) : post._id.toString();
    const loc = `${base}/posts/${slug || post._id.toString()}`;
    const lastmod = (post.updatedAt || post.createdAt || new Date()).toISOString();
    return { loc, lastmod };
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `<url>
  <loc>${u.loc}</loc>
  <lastmod>${u.lastmod}</lastmod>
</url>`
  )
  .join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml").send(xml);
};
