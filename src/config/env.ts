import dotenv from "dotenv";

dotenv.config();

const get = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 4000,
  mongoUri: get("MONGODB_URI"),
  jwtSecret: get("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "30d",
  clientUrl: "https://lernu.io",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  r2Endpoint: get("R2_ENDPOINT"),
  r2AccessKey: get("R2_ACCESS_KEY"),
  r2SecretKey: get("R2_SECRET_KEY"),
  r2Bucket: get("R2_BUCKET"),
  r2PublicBase: get("R2_PUBLIC_BASE")
};
