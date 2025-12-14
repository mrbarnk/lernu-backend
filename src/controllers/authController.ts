import { Request, Response } from "express";
import { generateTokens } from "../utils/tokens";
import { User } from "../models/User";
import { HttpError } from "../middleware/error";
import { serializeUser } from "../utils/serializers";
import { getClientIp } from "../utils/ip";

export const signup = async (req: Request, res: Response) => {
  const { email, password, username, displayName, ref } = req.body;
  const registrationIp = getClientIp(req);
  const registrationRef = typeof ref === "string" && ref.trim().length ? ref.trim() : undefined;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    throw new HttpError(400, "Email or username already in use");
  }
  const user = await User.create({
    email,
    password,
    username,
    displayName,
    registrationIp,
    registrationRef,
    loginHistory: registrationIp ? [{ ip: registrationIp, loggedInAt: new Date() }] : []
  });
  const tokens = generateTokens(user);
  res.json({ user: serializeUser(user), tokens });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new HttpError(401, "Invalid credentials");
  const valid = await user.comparePassword(password);
  if (!valid) throw new HttpError(401, "Invalid credentials");

  const loginIp = getClientIp(req);
  if (loginIp) {
    user.loginHistory = user.loginHistory ?? [];
    user.loginHistory.push({ ip: loginIp, loggedInAt: new Date() });
    await user.save();
  }

  const tokens = generateTokens(user);
  res.json({ user: serializeUser(user), tokens });
};

export const me = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  res.json({ user: serializeUser(req.user) });
};

export const logout = async (_req: Request, res: Response) => {
  res.json({ message: "Logged out" });
};
