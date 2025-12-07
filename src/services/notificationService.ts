import { Types } from "mongoose";
import { Notification, NotificationType } from "../models/Notification";
import { User } from "../models/User";
import { extractMentions } from "../utils/mentions";

interface NotifyParams {
  userId: Types.ObjectId;
  actorId: Types.ObjectId;
  type: NotificationType;
  postId?: Types.ObjectId;
  postTitle?: string;
}

export const notifyUser = async ({
  userId,
  actorId,
  type,
  postId,
  postTitle
}: NotifyParams) => {
  if (!userId || userId.equals(actorId)) return;
  await Notification.create({
    user: userId,
    actor: actorId,
    type,
    postId,
    postTitle
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
