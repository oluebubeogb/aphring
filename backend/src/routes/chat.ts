import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { retrieveContext, generateAnswer } from "../services/ai.js";
import { bumpFromRecords, SIGNAL_WEIGHTS, track } from "../services/affinity.js";

const router = Router();
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
    const { answer, sources: used } = await generateAnswer(content, sources);
    const sourceIds = used.map((s) => s.id);

    const assistantMsg = await prisma.message.create({
      data: { chatId, role: "ASSISTANT", content: answer, sourceIds },
    });
    await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    track(bumpFromRecords(req.user!.id, sourceIds, SIGNAL_WEIGHTS.chatSource));

    res.json({
      message: assistantMsg,
      sources: used.map((s) => ({ id: s.id, title: s.title, type: s.type })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
