import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN", "MODERATOR"));

router.get("/stats", async (_req, res, next) => {
  try {
    const [users, documents, pending, verified, communities] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
      prisma.knowledgeRecord.count({ where: { status: "PENDING" } }),
      prisma.knowledgeRecord.count({ where: { status: "VERIFIED" } }),
      prisma.community.count(),
    ]);
    res.json({ users, documents, pending, verified, communities });
  } catch (err) {
    next(err);
  }
});

router.get("/pending", async (_req, res, next) => {
  try {
    const records = await prisma.knowledgeRecord.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        community: { select: { id: true, name: true } },
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
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

export default router;
