export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const parsePagination = (
  query: Record<string, unknown>,
  defaultLimit = 10,
  maxLimit = 50
) => {
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(query.limit) || Number(defaultLimit))
  );
  const cursorValue = typeof query.cursor === "string" ? query.cursor : undefined;
  const cursor = cursorValue ? new Date(cursorValue) : undefined;
  return { limit, cursor };
};

export const buildCursorFilter = (cursor?: Date) =>
  cursor ? { createdAt: { $lt: cursor } } : {};

export const getNextCursor = <T extends { createdAt: Date }>(
  items: T[],
  limit: number
) => {
  if (items.length < limit) return null;
  return items[items.length - 1].createdAt.toISOString();
};
