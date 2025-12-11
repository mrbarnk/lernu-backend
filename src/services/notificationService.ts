import { Types } from "mongoose";
import { env } from "../config/env";
import { Notification, NotificationType } from "../models/Notification";
import { User, UserDocument } from "../models/User";
import { extractMentions } from "../utils/mentions";
import { slugify } from "../utils/slug";
import { emailEnabled, sendEmail } from "./emailService";

interface NotifyParams {
  userId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: NotificationType;
  postId?: Types.ObjectId;
  postTitle?: string;
  reelId?: Types.ObjectId;
  reelTitle?: string;
  commentId?: Types.ObjectId;
}

type MinimalUser = Pick<UserDocument, "_id" | "username" | "displayName">;

interface CommentNotificationParams {
  actor: MinimalUser;
  comment: { _id: Types.ObjectId; content: string };
  post?: { _id: Types.ObjectId; title?: string; author: Types.ObjectId; createdAt?: Date };
  reel?: { _id: Types.ObjectId; title?: string; author: Types.ObjectId; createdAt?: Date };
  parentCommentAuthorId?: Types.ObjectId | null;
}

type CommentReason = "post-comment" | "reel-comment" | "reply";

const baseUrl = env.clientUrl.replace(/\/+$/, "");

const escapeHtml = (value?: string) =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const makeExcerpt = (text?: string, length = 240) => {
  if (!text) return "";
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}...`;
};

const formatDateSegment = (value?: Date) => {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildPostUrl = (post: { _id: Types.ObjectId; title?: string; createdAt?: Date }) => {
  const slug = slugify(post.title || "post");
  const dateSegment = formatDateSegment(post.createdAt);
  const path = dateSegment
    ? `/post/${dateSegment}/${slug}-${post._id.toString()}`
    : `/post/${slug}-${post._id.toString()}`;
  return `${baseUrl}${path}`;
};

const buildReelUrl = (reelId: Types.ObjectId) => `${baseUrl}/reels/${reelId.toString()}`;

const buildCommentUrl = (targetUrl: string, commentId: Types.ObjectId) =>
  `${targetUrl}#comment-${commentId.toString()}`;

const commentEmailTemplate = ({
  actorName,
  recipientName,
  headline,
  bodyCopy,
  commentText,
  actionUrl,
  actionLabel
}: {
  actorName: string;
  recipientName: string;
  headline: string;
  bodyCopy: string;
  commentText: string;
  actionUrl: string;
  actionLabel: string;
}) => {
  const safeActor = escapeHtml(actorName);
  const safeRecipient = escapeHtml(recipientName);
  const safeHeadline = escapeHtml(headline);
  const safeBody = escapeHtml(bodyCopy);
  const safeComment = escapeHtml(commentText);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeHeadline}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f8fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 4px 20px rgba(15,23,42,0.06);">
          <tr>
            <td style="font-size:22px;font-weight:700;padding-bottom:12px;">${safeHeadline}</td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:22px;padding-bottom:12px;">Hi ${safeRecipient},</td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:22px;padding-bottom:16px;">${safeBody}</td>
          </tr>
          <tr>
            <td style="padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:14px;line-height:21px;">${safeActor} wrote:<br/><span style="display:block;margin-top:8px;color:#0f172a;">${safeComment}</span></td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0 8px;">
              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">${escapeHtml(actionLabel)}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:18px;color:#64748b;">You are receiving this alert because someone interacted with your content on Lernu. If you prefer not to get these emails, update your notification preferences.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildEmailCopy = (
  reason: CommentReason,
  targetType: "post" | "reel",
  targetTitle: string,
  actorName: string
) => {
  const cleanTitle = makeExcerpt(targetTitle, 80);
  const descriptor = cleanTitle ? `${targetType} "${cleanTitle}"` : `your ${targetType}`;

  if (reason === "reply") {
    return {
      subject: `${actorName} replied to your comment`,
      headline: "New reply to your comment",
      body: `${actorName} replied to your comment on ${descriptor}.`
    };
  }

  return {
    subject: `${actorName} commented on your ${targetType}`,
    headline: `New comment on your ${targetType}`,
    body: `${actorName} left a new comment on ${descriptor}.`
  };
};

export const notifyUser = async ({
  userId,
  actorId,
  type,
  postId,
  postTitle,
  reelId,
  reelTitle,
  commentId
}: NotifyParams) => {
  if (!userId || userId.equals(actorId)) return;
  await Notification.create({
    user: userId,
    actor: actorId,
    type,
    postId,
    postTitle,
    reelId,
    reelTitle,
    commentId
  });
};

export const notifyMentions = async (
  content: string,
  actorId: Types.ObjectId,
  postId?: Types.ObjectId,
  postTitle?: string
) => {
  const usernames = extractMentions(content);
  if (!usernames.length) return;
  const users = await User.find({ username: { $in: usernames } }, "_id");
  await Promise.all(
    users.map((user) =>
      notifyUser({
        userId: user._id,
        actorId,
        type: "mention",
        postId,
        postTitle
      })
    )
  );
};

export const notifyCommentParticipants = async ({
  actor,
  comment,
  post,
  reel,
  parentCommentAuthorId
}: CommentNotificationParams) => {
  const recipientReasons = new Map<string, CommentReason>();

  const addRecipient = (id: Types.ObjectId | undefined | null, reason: CommentReason) => {
    if (!id) return;
    if (id.equals(actor._id)) return;
    const key = id.toString();
    const existing = recipientReasons.get(key);
    if (!existing || reason === "reply") recipientReasons.set(key, reason);
  };

  if (post?.author) addRecipient(new Types.ObjectId(post.author), "post-comment");
  if (reel?.author) addRecipient(new Types.ObjectId(reel.author), "reel-comment");
  if (parentCommentAuthorId) addRecipient(new Types.ObjectId(parentCommentAuthorId), "reply");

  if (!recipientReasons.size) return;

  await Promise.all(
    Array.from(recipientReasons.keys()).map((id) =>
      notifyUser({
        userId: new Types.ObjectId(id),
        actorId: actor._id,
        type: "comment",
        postId: post?._id,
        postTitle: post?.title,
        reelId: reel?._id,
        reelTitle: reel?.title,
        commentId: comment._id
      })
    )
  );

  if (!emailEnabled) return;

  const recipients = await User.find(
    { _id: { $in: Array.from(recipientReasons.keys()) } },
    "email username displayName"
  ).lean();

  if (!recipients.length) return;

  const actorName = actor.displayName || actor.username || "Someone";
  const targetType: "post" | "reel" = post ? "post" : "reel";
  const targetTitle = post?.title ?? reel?.title ?? "";
  const actionUrl = buildCommentUrl(
    post ? buildPostUrl(post) : reel ? buildReelUrl(reel._id) : baseUrl,
    comment._id
  );
  const commentText = makeExcerpt(comment.content, 260);

  await Promise.all(
    recipients.map(async (user) => {
      if (!user.email) return;
      const reason = recipientReasons.get(user._id.toString());
      if (!reason) return;

      const copy = buildEmailCopy(reason, targetType, targetTitle, actorName);
      const html = commentEmailTemplate({
        actorName,
        recipientName: user.displayName || user.username || "there",
        headline: copy.headline,
        bodyCopy: copy.body,
        commentText,
        actionUrl,
        actionLabel: "View comment"
      });

      await sendEmail({ to: user.email, subject: copy.subject, html });
    })
  );
};
