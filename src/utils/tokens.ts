import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserDocument } from "../models/User";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export const signAccessToken = (user: UserDocument) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  } as jwt.SignOptions);

export const signRefreshToken = (user: UserDocument) =>
  jwt.sign({ sub: user._id.toString(), type: "refresh" }, env.jwtSecret, {
    expiresIn: env.refreshExpiresIn
  } as jwt.SignOptions);

export const generateTokens = (user: UserDocument): AuthTokens => ({
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user)
});
