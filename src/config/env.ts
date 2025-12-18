import dotenv from "dotenv";

dotenv.config();

const get = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
};

const optional = (key: string, fallback?: string) => process.env[key] ?? fallback;

const parseNumber = (value?: string) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 4000,
  mongoUri: get("MONGODB_URI"),
  jwtSecret: get("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "30d",
  clientUrl: optional("CLIENT_URL", "https://lernu.io")!,
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  r2Endpoint: get("R2_ENDPOINT"),
  r2AccessKey: get("R2_ACCESS_KEY"),
  r2SecretKey: get("R2_SECRET_KEY"),
  r2Bucket: get("R2_BUCKET"),
  r2PublicBase: get("R2_PUBLIC_BASE"),
  smtpHost: optional("SMTP_HOST"),
  smtpPort: parseNumber(process.env.SMTP_PORT),
  smtpUser: optional("SMTP_USER"),
  smtpPass: optional("SMTP_PASS"),
  smtpFrom: optional("SMTP_FROM"),
  smtpFromName: optional("SMTP_FROM_NAME"),
  smtpSecure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  contactEmail: optional("CONTACT_EMAIL"),
  openAiApiKey: optional("OPENAI_API_KEY"),
  openAiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  geminiModel: optional("GEMINI_MODEL", "gemini-2.5-flash"),
  aiProvider: optional("AI_PROVIDER", "openai")
};
