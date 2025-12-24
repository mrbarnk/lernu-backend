import { Types } from "mongoose";
import { Post } from "../models/Post";
import { slugify } from "./slug";

const trimSlugWithSuffix = (base: string, suffix: string, maxLength = 60) => {
  const allowance = maxLength - suffix.length;
  const safeBase = allowance > 0 ? base.slice(0, allowance) : base;
  return `${safeBase}${suffix}`;
};

export const normalizeSlug = (value?: string) => slugify(value ?? "");

export const buildSlugBase = (input: {
  slug?: string;
  title?: string | null;
  content?: string;
  fallbackId: string;
}) => {
  const candidate = input.slug?.trim() || input.title?.trim() || input.content?.slice(0, 120) || "";
  const normalized = normalizeSlug(candidate);
  if (normalized.length > 0) return normalized;
  return `post-${input.fallbackId.slice(-6)}`;
};

export const ensureUniqueSlug = async (base: string, excludeId?: Types.ObjectId) => {
  let candidate = base;
  let counter = 2;
  // eslint-disable-next-line no-constant-condition
  while (await Post.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = trimSlugWithSuffix(base, `-${counter++}`);
  }
  return candidate;
};

export const generateUniqueSlug = async (
  input: { slug?: string; title?: string | null; content?: string; fallbackId: string },
  excludeId?: Types.ObjectId
) => {
  const base = buildSlugBase(input);
  return ensureUniqueSlug(base, excludeId);
};
