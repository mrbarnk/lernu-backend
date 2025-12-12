import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { connectDatabase } from "./config/db";
import { registerRoutes } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300
  })
);
app.use(helmet());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(env.uploadDir)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDatabase();

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(env.port, () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on port ${env.port}`);
        resolve();
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        // eslint-disable-next-line no-console
        console.error(`Failed to start server on port ${env.port}:`, err.message);
        reject(err);
      });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Startup failed:", err);
    process.exit(1);
  }
};

void start();
