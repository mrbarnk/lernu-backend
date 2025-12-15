import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { env } from "../config/env";
import { User } from "../models/User";
import {
  OnlineUser,
  getOnlineUsers,
  markUserOffline,
  markUserOnline
} from "../services/presenceService";

interface TokenPayload {
  sub?: string;
}

const extractToken = (socket: Socket): string | undefined => {
  const authToken = socket.handshake.auth?.token;
  const queryToken = socket.handshake.query?.token;
  const raw =
    typeof authToken === "string"
      ? authToken
      : typeof queryToken === "string"
      ? queryToken
      : Array.isArray(queryToken)
      ? queryToken[0]
      : undefined;

  if (!raw) return undefined;
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
};

const resolveUserFromToken = async (token?: string): Promise<OnlineUser | null> => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const userId = decoded.sub;
    if (!userId || !Types.ObjectId.isValid(userId)) return null;

    const user = await User.findById(userId, "username displayName avatar");
    if (!user) return null;

    return {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar
    };
  } catch (err) {
    return null;
  }
};

export const createSocketServer = (server: HttpServer) => {
  const io = new Server(server, {
    cors: {
      origin: env.clientUrl,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const user = await resolveUserFromToken(extractToken(socket));
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user as OnlineUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    await markUserOnline(user);
    io.emit("online-users", getOnlineUsers());

    socket.on("disconnect", async () => {
      await markUserOffline(user.id);
      io.emit("online-users", getOnlineUsers());
    });
  });

  return io;
};
