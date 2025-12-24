import { Request, Response } from "express";
import { env } from "../config/env";
import { Post } from "../models/Post";
import { Category } from "../models/Category";
import { slugify } from "../utils/slug";

const baseUrl = env.clientUrl.replace(/\/+$/, "");
const xmlNs = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

const toIsoString = (value?: Date | string) => new Date(value ?? Date.now()).toISOString();
const toAbsoluteUrl = (path: string, apiBase: boolean = false) =>
  // if apiBase is true, we want to use api.${baseUrl}, else use client url
  apiBase
    ? `${baseUrl.replace(/^(https?:\/\/)(www\.)?/, "$1api.")}${path.startsWith("/") ? path : `/${path}`}`.replace(
        /([^:]\/)\/+/g,
        "$1"
      )
    :
  `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`.replace(/([^:]\/)\/+/g, "$1");

const trimSlug = (slug: string, max = 60) => {
  if (slug.length <= max) return slug;
  const slice = slug.slice(0, max);
  const lastDash = slice.lastIndexOf("-");
  return lastDash > 20 ? slice.slice(0, lastDash) : slice;
};

const slugifyForSitemap = (text: string) => trimSlug(slugify(text));

const buildPostSlug = (post: { title?: string | null; content?: string; id: string }) => {
  const candidate =
    (post.title && post.title.trim()) || (post.content || "").slice(0, 120) || post.id;
  const slug = slugifyForSitemap(candidate);
  const suffix = post.id.slice(-6);
  if (slug.length > 0) {
    const maxBaseLength = Math.max(1, 60 - (suffix.length + 1)); // account for "-<suffix>"
    const trimmed = slug.slice(0, maxBaseLength);
    return `${trimmed}-${suffix}`;
  }
  return `post-${suffix}`;
};

const resolvePostPath = (post: { id: string; slug?: string; title?: string | null; content?: string }) => {
  const rawSlug = (post as any).slug as string | undefined;
  const slug = rawSlug && rawSlug.trim().length > 0 ? rawSlug : buildPostSlug(post);
  return `/blog/${slug}`;
};

const generateCategoryUrl = (categoryName: string) => `/blog/${slugifyForSitemap(categoryName)}`;

const meetsLength = (text?: string) => {
  if (!text) return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 100;
};

const xmlUrlEntry = (url: {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}) => {
  const parts = [`  <loc>${url.loc}</loc>`];
  if (url.lastmod) parts.push(`  <lastmod>${url.lastmod}</lastmod>`);
  if (url.changefreq) parts.push(`  <changefreq>${url.changefreq}</changefreq>`);
  if (url.priority) parts.push(`  <priority>${url.priority}</priority>`);
  return `<url>\n${parts.join("\n")}\n</url>`;
};

export const getPostsSitemap = async (_req: Request, res: Response) => {
  const posts = await Post.find({}, "title content slug createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const urls = posts
    .filter((post) => meetsLength(post.content || post.title || ""))
    .map((post) => {
      const loc = toAbsoluteUrl(
        resolvePostPath({
          title: post.title,
          id: post._id.toString(),
          slug: (post as any).slug,
          content: post.content || ""
        })
      );
      const lastmod = toIsoString(post.updatedAt || post.createdAt);
      return { loc, lastmod, changefreq: "weekly", priority: "0.8" };
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${xmlNs}>
${urls.map((u) => xmlUrlEntry(u)).join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml").send(xml);
};

export const getCategoriesSitemap = async (_req: Request, res: Response) => {
  const categories = await Category.find({}, "name").sort({ name: 1 }).lean();
  const now = toIsoString();

  const urls = categories.map((category) => ({
    loc: toAbsoluteUrl(generateCategoryUrl(category.name)),
    lastmod: now,
    changefreq: "weekly",
    priority: "0.6"
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${xmlNs}>
${urls.map((u) => xmlUrlEntry(u)).join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml").send(xml);
};

export const getPagesSitemap = async (_req: Request, res: Response) => {
  const now = toIsoString();
  const pages = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/blog", changefreq: "weekly", priority: "0.7" }
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${xmlNs}>
${pages
  .map((page) =>
    xmlUrlEntry({
      loc: toAbsoluteUrl(page.path),
      lastmod: now,
      changefreq: page.changefreq,
      priority: page.priority
    })
  )
  .join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml").send(xml);
};

export const getSitemapIndex = async (_req: Request, res: Response) => {
  const latestPost = await Post.findOne({}, "updatedAt createdAt").sort({
    updatedAt: -1,
    createdAt: -1
  });
  const now = toIsoString();
  const postLastmod = latestPost ? toIsoString(latestPost.updatedAt || latestPost.createdAt) : now;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex ${xmlNs}>
  <sitemap>
    <loc>${toAbsoluteUrl("/sitemaps/posts.xml", true)}</loc>
    <lastmod>${postLastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${toAbsoluteUrl("/sitemaps/categories.xml", true)}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${toAbsoluteUrl("/sitemaps/pages.xml", true)}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;

  res.header("Content-Type", "application/xml").send(xml);
};

export const getSitemap = getSitemapIndex;
