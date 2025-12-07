import mongoose from "mongoose";
import { env } from "./env";

export const connectDatabase = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    // eslint-disable-next-line no-console
    console.log("MongoDB connected");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Mongo connection error", err);
    process.exit(1);
  }
};
