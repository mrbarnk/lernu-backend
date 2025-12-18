import { Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../middleware/error";
import { sendEmail, emailEnabled } from "../services/emailService";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const submitContact = async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body as {
    name: string;
    email: string;
    subject: string;
    message: string;
  };

  if (!emailEnabled || !env.contactEmail) {
    throw new HttpError(503, "Contact form temporarily unavailable");
  }

  const safeSubject = subject.trim();
  const safeName = name.trim();
  const safeEmail = email.trim();
  const safeMessage = message.trim();

  const html = `
    <p>You received a new contact submission on Lernu.</p>
    <p><strong>Name:</strong> ${escapeHtml(safeName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(safeEmail)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(safeSubject)}</p>
    <p><strong>Message:</strong><br/>${escapeHtml(safeMessage).replace(/\n/g, "<br/>")}</p>
  `;

  await sendEmail({
    to: env.contactEmail,
    subject: `Contact: ${safeSubject}`,
    html
  });

  res.status(201).json({ message: "Message received" });
};
