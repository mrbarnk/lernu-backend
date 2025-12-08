import { Request, Response } from "express";
import { env } from "../config/env";
import { Post } from "../models/Post";
import { slugify } from "../utils/slug";


/**
 * Generate a date string in YYYY-MM-DD format
 */
export function formatDateForUrl(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

/**
 * Generate an SEO-friendly post URL
 * Format: /post/YYYY-MM-DD/title-slug
 */
export function generatePostUrl(post: { id: string; title?: string; content: string; createdAt: string }): string {
  const dateStr = formatDateForUrl(post.createdAt);
  const titleOrContent = post.title || post.content.slice(0, 60);
  const slug = slugify(titleOrContent);
  return `/post/${dateStr}/${slug}-${post.id}`;
}

export const getSitemap = async (_req: Request, res: Response) => {
  const posts = await Post.find({}, "title createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const base = env.clientUrl.replace(/\/+$/, "");
  const urls = posts.map((post) => {
    const slug = post.title ? slugify(post.title) : post._id.toString();
    const loc = `${base}${generatePostUrl({
      title: post.title,
      id: post._id.toString(),
      content: post.content || '',
      createdAt: post.createdAt.toString(),
    })}`;
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
