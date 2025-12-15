import { User } from "../models/User";

export interface OnlineUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

const onlineUsers = new Map<string, OnlineUser>();
const connectionCounts = new Map<string, number>();

const setOnlineFlag = async (userId: string, isOnline: boolean) => {
  try {
    await User.updateOne({ _id: userId }, { $set: { isOnline } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to update online status for user ${userId}`, err);
  }
};

export const markUserOnline = async (user: OnlineUser) => {
  const previous = connectionCounts.get(user.id) ?? 0;
  connectionCounts.set(user.id, previous + 1);
  onlineUsers.set(user.id, user);
  if (previous === 0) {
    await setOnlineFlag(user.id, true);
  }
};

export const markUserOffline = async (userId: string) => {
  const existing = connectionCounts.get(userId) ?? 0;
  if (existing <= 1) {
    connectionCounts.delete(userId);
    onlineUsers.delete(userId);
    await setOnlineFlag(userId, false);
  } else {
    connectionCounts.set(userId, existing - 1);
  }
};

export const getOnlineUsers = (): OnlineUser[] => Array.from(onlineUsers.values());

export const getOnlineCount = () => onlineUsers.size;

export const resetOnlineUsers = async () => {
  onlineUsers.clear();
  connectionCounts.clear();
  try {
    await User.updateMany({ isOnline: true }, { $set: { isOnline: false } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to reset online users", err);
  }
};
