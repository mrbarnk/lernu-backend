import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User, UserDocument, UserRole } from "../models/User";
import { HttpError } from "./error";

interface TokenPayload {
  sub: string;
  role: UserRole;
}

const getToken = (req: Request) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.replace("Bearer ", "");
  return req.cookies?.token;
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const token = getToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const user = await User.findById(decoded.sub);
    if (user) req.user = user as UserDocument;
  } catch (err) {
    // ignore invalid token
  }
  next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  await optionalAuth(req, res, (err?: unknown) => {
    if (err) next(err);
  });
  if (!req.user) {
    next(new HttpError(401, "Authentication required"));
    return;
  }
  next();
};

export const requireRole =
  (roles: UserRole[]) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, "Forbidden"));
      return;
    }
    next();
  };
