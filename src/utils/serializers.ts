import { Types } from "mongoose";
import { CommentDocument } from "../models/Comment";
import { NotificationDocument } from "../models/Notification";
import { PostDocument } from "../models/Post";
import { UserDocument } from "../models/User";
import { formatDisplayTime } from "./date";

const toId = (value: unknown) =>
  value instanceof Types.ObjectId ? value.toString() : (value as string);

const hasId = (value: unknown, match?: Types.ObjectId) =>
  !!match && Array.isArray(value) && value.some((id) => toId(id) === match.toString());

export const serializeUser = (
  user: Partial<UserDocument> & { _id: Types.ObjectId | string },
  currentUserId?: Types.ObjectId
) => ({
  id: toId(user._id),
  email: (user as UserDocument).email,
  username: (user as UserDocument).username,
  displayName: (user as UserDocument).displayName,
  avatar: (user as UserDocument).avatar,
  coverPhoto: (user as UserDocument).coverPhoto,
  bio: (user as UserDocument).bio,
  joinedAt: (user as UserDocument).joinedAt,
  level: (user as UserDocument).level,
  isOnline: (user as UserDocument).isOnline,
  role: (user as UserDocument).role,
  followerCount: Array.isArray((user as UserDocument).followers)
    ? (user as UserDocument).followers.length
    : undefined,
  isFollowing: hasId((user as UserDocument).followers, currentUserId)
});

const hasUserId = (value: unknown, userId?: Types.ObjectId) =>
  !!userId && Array.isArray(value) && value.some((id) => toId(id) === userId.toString());

const makeExcerpt = (text?: string, length = 200) => {
  if (!text) return text;
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
};

export const serializePost = (
  post: Partial<PostDocument> & { _id: Types.ObjectId },
  currentUserId?: Types.ObjectId,
  options?: { excerptLength?: number }
) => ({
  id: toId(post._id),
  author:
    typeof post.author === "object" && post.author
      ? serializeUser(post.author as unknown as UserDocument, currentUserId)
      : undefined,
  categoryId: post.categoryId ? toId(post.categoryId as Types.ObjectId) : undefined,
  title: post.title,
  content: options?.excerptLength ? makeExcerpt(post.content, options.excerptLength) : post.content,
  code: post.code,
  images: post.images ?? [],
  createdAt: post.createdAt,
  displayTime: post.createdAt ? formatDisplayTime(new Date(post.createdAt)) : undefined,
  tags: post.tags ?? [],
  likes: post.likes ?? (post.likedBy ? (post.likedBy as Types.ObjectId[]).length : 0),
  comments: post.commentsCount ?? 0,
  shares: post.shares ?? 0,
  isPinned: post.isPinned ?? false,
  isSolved: post.isSolved ?? false,
  isEdited: post.isEdited ?? false,
  isLiked: hasUserId(post.likedBy, currentUserId) ?? false,
  isBookmarked: hasUserId(post.bookmarkedBy, currentUserId) ?? false
});

export const serializeComment = (
  comment: Partial<CommentDocument> & { _id: Types.ObjectId },
  currentUserId?: Types.ObjectId
) => ({
  id: toId(comment._id),
  postId: comment.postId ? toId(comment.postId as Types.ObjectId) : undefined,
  author:
    typeof comment.author === "object" && comment.author
      ? serializeUser(comment.author as unknown as UserDocument)
      : undefined,
  content: comment.content,
  code: comment.code,
  images: comment.images ?? [],
  createdAt: comment.createdAt,
  displayTime: comment.createdAt ? formatDisplayTime(new Date(comment.createdAt)) : undefined,
  likes: comment.likes ?? (comment.likedBy ? (comment.likedBy as Types.ObjectId[]).length : 0),
  isLiked: hasUserId(comment.likedBy, currentUserId),
  isAccepted: comment.isAccepted ?? false,
  isEdited: comment.isEdited ?? false
});

export const serializeNotification = (
  notification: Partial<NotificationDocument> & { _id: Types.ObjectId }
) => ({
  id: toId(notification._id),
  type: notification.type,
  actor:
    typeof notification.actor === "object" && notification.actor
      ? serializeUser(notification.actor as any)
      : undefined,
  postId: notification.postId ? toId(notification.postId as Types.ObjectId) : undefined,
  postTitle: notification.postTitle,
  createdAt: notification.createdAt,
  isRead: notification.isRead
});
