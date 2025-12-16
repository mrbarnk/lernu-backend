import { Request, Response } from "express";
import { Types } from "mongoose";
import { AiConversation } from "../models/AiConversation";
import { AiConversationMessage } from "../models/AiConversationMessage";
import { HttpError } from "../middleware/error";

const toSnippet = (text?: string, maxLength = 160) => {
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
};

const serializeConversation = (conversation: any) => ({
  id: conversation._id.toString(),
  title: conversation.title,
  flowStep: conversation.flowStep,
  generatedScript: conversation.generatedScript,
  selectedTopic: conversation.selectedTopic,
  selectedTopicId: conversation.selectedTopicId,
  selectedFormat: conversation.selectedFormat,
  selectedFormatId: conversation.selectedFormatId,
  selectedStyle: conversation.selectedStyle,
  selectedDuration: conversation.selectedDuration,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt
});

const serializeMessage = (message: any) => ({
  id: message._id.toString(),
  role: message.role,
  content: message.content,
  options: message.options,
  scenes: message.scenes?.length ? message.scenes : undefined,
  createdAt: message.createdAt
});

export const listConversations = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const userId = req.user._id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const conversations = await AiConversation.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const ids = conversations.map((c) => c._id as Types.ObjectId);
  const lastMessageMap = new Map<string, string>();
  if (ids.length) {
    const latestMessages = await AiConversationMessage.aggregate([
      { $match: { userId, conversationId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$conversationId", content: { $first: "$content" } } }
    ]);
    latestMessages.forEach((item) => {
      lastMessageMap.set(item._id.toString(), item.content as string);
    });
  }

  res.json({
    conversations: conversations.map((conv) => ({
      id: conv._id.toString(),
      title: conv.title,
      updatedAt: conv.updatedAt,
      lastMessageSnippet: toSnippet(lastMessageMap.get(conv._id.toString()))
    }))
  });
};

export const createConversation = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { title } = req.body as { title?: string };

  const conversation = await AiConversation.create({
    userId: req.user._id,
    title
  });

  res.status(201).json({
    conversation: {
      ...serializeConversation(conversation),
      messages: []
    }
  });
};

const findOwnedConversation = async (conversationId: string, userId: Types.ObjectId) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new HttpError(400, "Invalid conversation id");
  }
  const conversation = await AiConversation.findOne({ _id: conversationId, userId });
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }
  return conversation;
};

export const getConversation = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  const messages = await AiConversationMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .lean();

  res.json({
    conversation: {
      ...serializeConversation(conversation),
      messages: messages.map(serializeMessage)
    }
  });
};

export const updateConversation = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const conversation = await findOwnedConversation(req.params.id, req.user._id);

  const updates = req.body ?? {};
  const updated = await AiConversation.findByIdAndUpdate(conversation._id, updates, {
    new: true
  });

  res.json({ conversation: updated ? serializeConversation(updated) : serializeConversation(conversation) });
};

export const deleteConversation = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const conversation = await findOwnedConversation(req.params.id, req.user._id);

  await AiConversation.deleteOne({ _id: conversation._id });
  await AiConversationMessage.deleteMany({ conversationId: conversation._id, userId: req.user._id });

  res.json({ message: "Conversation deleted" });
};

export const addConversationMessage = async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const conversation = await findOwnedConversation(req.params.id, req.user._id);

  const { role, content, options, scenes } = req.body as {
    role: "assistant" | "user";
    content: string;
    options?: unknown;
    scenes?: any[];
  };

  const message = await AiConversationMessage.create({
    conversationId: conversation._id,
    userId: req.user._id,
    role,
    content,
    options,
    scenes
  });

  conversation.updatedAt = new Date();
  await conversation.save();

  res.status(201).json({ message: serializeMessage(message) });
};
