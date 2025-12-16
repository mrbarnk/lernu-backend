import sanitizeHtml from "sanitize-html";

const defaultOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: "discard"
};

export const sanitizeText = (value?: string | null) => {
  if (typeof value !== "string") return value as undefined;
  const cleaned = sanitizeHtml(value, defaultOptions).trim();
  return cleaned;
};
