import { Request } from "express";

const extractFromForwardedFor = (headerValue: string | string[] | undefined) => {
  if (!headerValue) return undefined;
  if (typeof headerValue === "string") return headerValue.split(",")[0]?.trim();
  if (Array.isArray(headerValue)) return headerValue[0]?.trim();
  return undefined;
};

export const getClientIp = (req: Request): string | undefined => {
  const forwarded = extractFromForwardedFor(req.headers["x-forwarded-for"]);
  if (forwarded) return forwarded;

  const directIp = req.ip?.trim();
  if (directIp) return directIp;

  const socketIp = req.socket?.remoteAddress?.trim() ?? req.connection?.remoteAddress?.trim();
  return socketIp || undefined;
};
