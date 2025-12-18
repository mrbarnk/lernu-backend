import "express-async-errors";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { env } from "./config/env";
import { connectDatabase } from "./config/db";
import { registerRoutes } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { createSocketServer } from "./realtime/socketServer";
import { resetOnlineUsers } from "./services/presenceService";
import { generalLimiter } from "./middleware/rateLimiters";

const app = express();
const httpServer = createServer(app);
createSocketServer(httpServer);

// Enable trust proxy so rate limiting and IP-based features respect X-Forwarded-For (common with proxies/load balancers).
app.set("trust proxy", true);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(
  generalLimiter
);
app.use(helmet());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(env.uploadDir)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ip: _req.ip });
});

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  try {
    await connectDatabase();
    await resetOnlineUsers();

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(env.port, () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on port ${env.port}`);
        resolve();
      });

      httpServer.on("error", (err: NodeJS.ErrnoException) => {
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
