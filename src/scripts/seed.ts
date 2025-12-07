import mongoose from "mongoose";
import { env } from "../config/env";
import { Category } from "../models/Category";

const categories = [
  { name: "General", icon: "🧭", color: "#6b7280" },
  { name: "Questions", icon: "❓", color: "#f97316" },
  { name: "Tutorials", icon: "📚", color: "#2563eb" },
  { name: "Showcase", icon: "✨", color: "#8b5cf6" },
  { name: "Discussion", icon: "💬", color: "#10b981" },
  { name: "Resources", icon: "🔗", color: "#f59e0b" }
];

const seed = async () => {
  await mongoose.connect(env.mongoUri);
  await Category.deleteMany({});
  await Category.insertMany(categories);
  // eslint-disable-next-line no-console
  console.log("Seeded categories");
  await mongoose.disconnect();
};

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
