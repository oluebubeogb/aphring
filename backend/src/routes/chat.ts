import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { retrieveContext, generateAnswer } from "../services/ai.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(chats);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const chat = await prisma.chat.create({
      data: {
        userId: req.user!.id,
        title: "New Chat",
      },
    });
    res.status(201).json(chat);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const chat = await prisma.chat.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json(chat);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.chat.deleteMany({
      where: { id, userId: req.user!.id },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({
  content: z.string().min(1).max(4000),
});

router.post("/:id/messages", async (req: AuthRequest, res, next) => {
  try {
    const { content } = messageSchema.parse(req.body);
    const chatId = String(req.params.id);

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId: req.user!.id },
    });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    await prisma.message.create({
      data: {
        chatId,
        role: "USER",
        content,
      },
    });

    if (chat.title === "New Chat") {
      await prisma.chat.update({
        where: { id: chatId },
        data: { title: content.slice(0, 60) },
      });
    }

    const sources = await retrieveContext(content);
    const { answer, sources: usedSources } = await generateAnswer(
      content,
      sources
    );

    const assistantMsg = await prisma.message.create({
      data: {
        chatId,
        role: "ASSISTANT",
        content: answer,
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.json({
      message: assistantMsg,
      sources: usedSources.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
