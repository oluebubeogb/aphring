import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "MODERATOR"));

router.get("/stats", async (_req, res, next) => {
  try {
    const [users, documents, pending, verified, communities, reports, audio, votes] =
      await Promise.all([
        prisma.user.count(),
        prisma.document.count(),
        prisma.knowledgeRecord.count({ where: { status: "PENDING" } }),
        prisma.knowledgeRecord.count({ where: { status: "VERIFIED" } }),
        prisma.community.count(),
        prisma.report.count({ where: { status: "OPEN" } }),
        prisma.audioUpload.count(),
        prisma.vote.count(),
      ]);
    res.json({
      users,
      documents,
      pending,
      verified,
      communities,
      reports,
      audio,
      votes,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/pending", async (_req, res, next) => {
  try {
    const records = await prisma.knowledgeRecord.findMany({
      where: { status: "PENDING" },
      orderBy: [{ sourceRank: "desc" }, { createdAt: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true, reputation: true } },
        community: { select: { id: true, name: true, slug: true } },
        citations: { include: { document: true } },
      },
    });
    res.json(records);
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        reputation: true,
        createdAt: true,
        _count: { select: { knowledgeRecords: true, documents: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id/role", requireRole("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { role } = z.object({ role: z.enum(["USER", "MODERATOR", "ADMIN"]) }).parse(req.body);
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.get("/documents", async (_req, res, next) => {
  try {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { citations: true } },
      },
      take: 100,
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

router.get("/audio", async (_req, res, next) => {
  try {
    const items = await prisma.audioUpload.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
      take: 50,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

export default router;
