import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../services/prisma.js";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth.js";
import { retrieveContext, generateAnswer, AiServiceError, NO_INFO, RetrievedSource } from "../services/ai.js";
import { createAskJob, getAskJob, completeAskJob, failAskJob, AskJob } from "../services/askJobs.js";
import { bumpFromRecords, SIGNAL_WEIGHTS, track } from "../services/affinity.js";

const router = Router();

const toSourceRefs = (used: RetrievedSource[]) => used.map((s) => ({ id: s.id, title: s.title, type: s.type }));

function jobErrorMessage(err: unknown): string {
  if (err instanceof AiServiceError) return err.message;
  console.error("[chat] ask job failed:", (err as Error)?.message || err);
  return "Something went wrong while answering. Please try again.";
}

function jobPayload(job: AskJob, guest: boolean) {
  if (job.status === "pending") return { status: "pending", jobId: job.id };
  if (job.status === "error") return { status: "error", jobId: job.id, error: job.error };
  return guest
    ? { status: "done", jobId: job.id, answer: job.answer, sources: job.sources ?? [], saved: false }
    : { status: "done", jobId: job.id, message: job.message, sources: job.sources ?? [] };
}

/**
 * Public Ask — works logged out. Nothing is stored (no chat, no messages, no affinity).
 * Strict per-IP limits keep AI cost bounded; signed-in users should use /api/chats/:id/messages.
 */
const guestBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're asking quickly — wait a minute and try again." },
});
const guestHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => ((req as AuthRequest).user ? 60 : 15),
  keyGenerator: (req) => (req as AuthRequest).user?.id || req.ip || "anon",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Guest question limit reached for this hour. Sign in to keep asking and save your chats." },
});

router.post("/ask", optionalAuth, guestBurstLimiter, guestHourlyLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { content } = z.object({ content: z.string().trim().min(1).max(1000) }).parse(req.body);
    const sources = await retrieveContext(content);
    // No verified match → fixed answer, no job and no model call (cost control).
    if (sources.length === 0) return res.json({ status: "done", answer: NO_INFO, sources: [], saved: false });

    // The model can take 1–2 min (cold start): answer in the background, the browser polls the job.
    const jobId = createAskJob();
    generateAnswer(content, sources)
      .then(({ answer, sources: used }) => completeAskJob(jobId, { answer, sources: toSourceRefs(used) }))
      .catch((err) => failAskJob(jobId, jobErrorMessage(err)));
    res.status(202).json({ status: "pending", jobId });
  } catch (err) {
    next(err);
  }
});

/** Poll a guest Ask job. Job ids are random UUIDs and expire after 15 minutes. */
router.get("/ask/jobs/:jobId", (req, res) => {
  const job = getAskJob(String(req.params.jobId));
  if (!job || job.userId) return res.status(404).json({ error: "This answer has expired. Please ask again." });
  res.json(jobPayload(job, true));
});

router.use(requireAuth);

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as AuthRequest).user?.id || req.ip || "anon",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Chat limit reached. Try again later." },
});

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    res.json(
      await prisma.chat.findMany({
        where: { userId: req.user!.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    res.status(201).json(await prisma.chat.create({ data: { userId: req.user!.id, title: "New Chat" } }));
  } catch (err) {
    next(err);
  }
});

/** Poll a signed-in Ask job (registered before /:id so "jobs" isn't read as a chat id). */
router.get("/jobs/:jobId", (req: AuthRequest, res) => {
  const job = getAskJob(String(req.params.jobId));
  if (!job || job.userId !== req.user!.id) return res.status(404).json({ error: "This answer has expired. Please reload the chat." });
  res.json(jobPayload(job, false));
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: { id: String(req.params.id), userId: req.user!.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const ids = [...new Set(chat.messages.flatMap((m) => m.sourceIds))];
    const recs = ids.length
      ? await prisma.knowledgeRecord.findMany({
          where: { id: { in: ids }, status: "VERIFIED" },
          select: { id: true, title: true, type: true },
        })
      : [];
    const byId = new Map(recs.map((r) => [r.id, r]));
    res.json({
      ...chat,
      messages: chat.messages.map((m) => ({
        ...m,
        sources: m.sourceIds.map((id) => byId.get(id)).filter(Boolean),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    await prisma.chat.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({ content: z.string().trim().min(1).max(2000) });

router.post("/:id/messages", chatLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { content } = messageSchema.parse(req.body);
    const chatId = String(req.params.id);
    const chat = await prisma.chat.findFirst({ where: { id: chatId, userId: req.user!.id } });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    await prisma.message.create({ data: { chatId, role: "USER", content } });
    if (chat.title === "New Chat") {
      await prisma.chat.update({ where: { id: chatId }, data: { title: content.slice(0, 60) } });
    }

    const sources = await retrieveContext(content);
    if (sources.length === 0) {
      // No verified match → save the fixed answer, no model call.
      const assistantMsg = await prisma.message.create({
        data: { chatId, role: "ASSISTANT", content: NO_INFO, sourceIds: [] },
      });
      await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      return res.json({ status: "done", message: assistantMsg, sources: [] });
    }

    const userId = req.user!.id;
    const jobId = createAskJob({ chatId, userId });
    (async () => {
      const { answer, sources: used } = await generateAnswer(content, sources);
      const sourceIds = used.map((s) => s.id);
      const assistantMsg = await prisma.message.create({
        data: { chatId, role: "ASSISTANT", content: answer, sourceIds },
      });
      await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      track(bumpFromRecords(userId, sourceIds, SIGNAL_WEIGHTS.chatSource));
      completeAskJob(jobId, { answer, message: assistantMsg, messageId: assistantMsg.id, sources: toSourceRefs(used) });
    })().catch((err) => failAskJob(jobId, jobErrorMessage(err)));

    res.status(202).json({ status: "pending", jobId });
  } catch (err) {
    next(err);
  }
});

export default router;
