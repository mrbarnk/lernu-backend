const mentionRegex = /@([a-zA-Z0-9_]+)/g;

export const extractMentions = (content: string) => {
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
};
