import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import path from "path";
import { v4 as uuid } from "uuid";
import { env } from "../config/env";

const client = new S3Client({
  region: "auto",
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.r2AccessKey,
    secretAccessKey: env.r2SecretKey
  }
});

const cleanBase = env.r2PublicBase.replace(/\/+$/, "");

export const uploadBufferToR2 = async (params: {
  prefix: string;
  buffer: Buffer;
  originalName: string;
  contentType?: string;
}) => {
  const ext = path.extname(params.originalName) || "";
  const key = `${params.prefix}/${uuid()}${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType
    })
  );

  return `${cleanBase}/${key}`;
};
