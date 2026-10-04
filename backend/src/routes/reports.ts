import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        knowledgeRecordId: z.string(),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);

    const report = await prisma.report.create({
      data: {
        userId: req.user!.id,
        knowledgeRecordId: body.knowledgeRecordId,
        reason: body.reason,
      },
    });
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  async (_req, res, next) => {
    try {
      const reports = await prisma.report.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          knowledgeRecord: {
            select: { id: true, title: true, content: true, status: true },
          },
        },
      });
      res.json(reports);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  async (req: AuthRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const { status } = z
        .object({ status: z.enum(["RESOLVED", "DISMISSED"]) })
        .parse(req.body);
      const report = await prisma.report.update({
        where: { id },
        data: { status },
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
