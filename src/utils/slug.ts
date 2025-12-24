/**
 * Convert a string to a URL-friendly slug
 */
export function slugify(text: string): string {
  const maxLength = 60;
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single

  if (normalized.length <= maxLength) return normalized;
  const truncated = normalized.slice(0, maxLength);
  const lastDash = truncated.lastIndexOf("-");
  return lastDash > 20 ? truncated.slice(0, lastDash) : truncated;
}
