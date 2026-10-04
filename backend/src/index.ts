import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import knowledgeRoutes from "./routes/knowledge.js";
import documentRoutes from "./routes/documents.js";
import communityRoutes from "./routes/communities.js";
import adminRoutes from "./routes/admin.js";
import { errorHandler } from "./middleware/error.js";
import { ensureBucket } from "./services/minio.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));

const frontendUrl = process.env.FRONTEND_URL || "*";
app.use(
  cors({
    origin: frontendUrl === "*" ? true : frontendUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "aphring-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/admin", adminRoutes);

app.use(errorHandler);

async function start() {
  try {
    await ensureBucket();
    app.listen(PORT, () => {
      console.log(`aphring backend running on :${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();
