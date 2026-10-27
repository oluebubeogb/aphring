import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { validateStartupConfig } from "./config.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import knowledgeRoutes from "./routes/knowledge.js";
import documentRoutes from "./routes/documents.js";
import workstationRoutes from "./routes/workstation.js";
import voteRoutes from "./routes/votes.js";
import reportRoutes from "./routes/reports.js";
import oralRoutes from "./routes/oral.js";
import exploreRoutes from "./routes/explore.js";
import feedRoutes from "./routes/feed.js";
import meRoutes from "./routes/me.js";
import communityRoutes from "./routes/community.js";
import { pinsPublicRouter, pinsAdminRouter, recordPinAnalytics } from "./routes/pins.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { ensureStorage } from "./services/storage.js";

// Fails fast in production on a missing/weak JWT_SECRET.
validateStartupConfig();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));

// The frontend proxies /api through Next.js, so CORS is only needed for direct browser access.
const frontendUrl = process.env.FRONTEND_URL?.trim();
if (frontendUrl && frontendUrl !== "*") {
  app.use(cors({ origin: frontendUrl.split(",").map((s) => s.trim()), credentials: true }));
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "aphring-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
// Owner/admin analytics for a pinned record (before the knowledge router so /:id doesn't swallow it).
app.get("/api/knowledge/:id/pin-analytics", requireAuth, recordPinAnalytics);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/documents", documentRoutes);
// Pins (admin-only) mounted before the general workstation router (which allows moderators).
app.use("/api/workstation/pins", pinsAdminRouter);
app.use("/api/workstation", workstationRoutes);
app.use("/api/pins", pinsPublicRouter);
app.use("/api/votes", voteRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/oral", oralRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/feed", feedRoutes);
app.use("/api/me", meRoutes);
app.use("/api", communityRoutes);
// Old community pages are gone; Explore replaces them.
app.use("/api/communities", (_req, res) => res.status(410).json({ error: "Communities were replaced by Explore" }));

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

async function start() {
  try {
    await ensureStorage();
    app.listen(PORT, () => console.log(`aphring backend running on :${PORT}`));
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();
