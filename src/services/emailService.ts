import nodemailer from "nodemailer";
import { env } from "../config/env";

const isConfigured = Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort ?? 587,
      secure: env.smtpSecure ?? false,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    })
  : null;

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async ({ to, subject, html, text }: SendEmailParams) => {
  if (!transporter || !to) return;

  const from = env.smtpFromName ? `${env.smtpFromName} <${env.smtpFrom}>` : env.smtpFrom;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: text ?? stripTags(html)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send email", err);
  }
};

export const emailEnabled = Boolean(transporter);
