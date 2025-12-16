import { Types } from "mongoose";
import { CommentDocument } from "../models/Comment";
import { NotificationDocument } from "../models/Notification";
import { PostDocument } from "../models/Post";
import { ReelDocument } from "../models/Reel";
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
  badges: (user as UserDocument).badges ?? [],
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
) => {
  const images = Array.isArray(post.images)
    ? (post.images as string[]).filter((img) => typeof img === "string" && img.trim().length > 0)
    : [];

  return {
    id: toId(post._id),
    author:
      typeof post.author === "object" && post.author
        ? serializeUser(post.author as unknown as UserDocument, currentUserId)
        : undefined,
    categoryId: post.categoryId ? toId(post.categoryId as Types.ObjectId) : undefined,
    title: post.title,
    content: options?.excerptLength ? makeExcerpt(post.content, options.excerptLength) : post.content,
    code: post.code,
    images: images.length ? images : undefined,
    hasMedia: images.length > 0,
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
  };
};

export const serializeReel = (
  reel: Partial<ReelDocument> & { _id: Types.ObjectId },
  currentUserId?: Types.ObjectId
) => {
  const views = typeof reel.views === "number" ? reel.views : 0;
  const totalWatchSeconds = typeof reel.totalWatchSeconds === "number" ? reel.totalWatchSeconds : 0;
  const averageWatchSeconds = views > 0 ? totalWatchSeconds / views : 0;
  const thumbnail = (reel as ReelDocument).thumbnail;

  return {
    id: toId(reel._id),
    author:
      typeof reel.author === "object" && reel.author
        ? serializeUser(reel.author as unknown as UserDocument, currentUserId)
        : undefined,
    title: (reel as ReelDocument).title,
    content: (reel as ReelDocument).content,
    videoUrl: (reel as ReelDocument).videoUrl,
    thumbnail: thumbnail && thumbnail.trim().length ? thumbnail : undefined,
    durationSeconds: (reel as ReelDocument).durationSeconds,
    tags: (reel as ReelDocument).tags ?? [],
    views,
    totalWatchSeconds,
    averageWatchSeconds,
    lastViewedAt: (reel as ReelDocument).lastViewedAt,
    likes: reel.likes ?? (reel.likedBy ? (reel.likedBy as Types.ObjectId[]).length : 0),
    shares: reel.shares ?? 0,
    comments: (reel as any).commentsCount ?? 0,
    isLiked: hasUserId(reel.likedBy, currentUserId) ?? false,
    isBookmarked: hasUserId(reel.bookmarkedBy, currentUserId) ?? false,
    createdAt: reel.createdAt,
    displayTime: reel.createdAt ? formatDisplayTime(new Date(reel.createdAt)) : undefined,
    hasMedia: Boolean((reel as ReelDocument).videoUrl || thumbnail)
  };
};

export const serializeComment = (
  comment: Partial<CommentDocument> & { _id: Types.ObjectId },
  currentUserId?: Types.ObjectId
) => ({
  id: toId(comment._id),
  postId: comment.postId ? toId(comment.postId as Types.ObjectId) : undefined,
  reelId: comment.reelId ? toId(comment.reelId as Types.ObjectId) : undefined,
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
  parentId: comment.parentId ? toId(comment.parentId as Types.ObjectId) : null,
  repliesCount: (comment as any).repliesCount ?? 0,
  isAccepted: comment.isAccepted ?? false,
  isEdited: comment.isEdited ?? false
});

export const serializeNotification = (
  notification: Partial<NotificationDocument> & { _id: Types.ObjectId },
  currentUserId?: Types.ObjectId
) => {
  const post =
    typeof notification.postId === "object" && notification.postId
      ? serializePost(notification.postId as any, currentUserId, { excerptLength: 160 })
      : undefined;
  const comment =
    typeof notification.commentId === "object" && notification.commentId
      ? serializeComment(notification.commentId as any, currentUserId)
      : undefined;

  return {
    id: toId(notification._id),
    type: notification.type,
    actor:
      typeof notification.actor === "object" && notification.actor
        ? serializeUser(notification.actor as any)
        : undefined,
    postId: notification.postId ? toId(notification.postId as Types.ObjectId) : undefined,
    reelId: notification.reelId ? toId(notification.reelId as Types.ObjectId) : undefined,
    commentId: notification.commentId ? toId(notification.commentId as Types.ObjectId) : undefined,
    postTitle: notification.postTitle,
    reelTitle: notification.reelTitle,
    post,
    comment,
    createdAt: notification.createdAt,
    displayTime: notification.createdAt
      ? formatDisplayTime(new Date(notification.createdAt))
      : undefined,
    isRead: notification.isRead
  };
};
