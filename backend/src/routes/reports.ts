import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const router = Router();

/** Report a public (VERIFIED) record. Staff handle reports in the workstation. */
router.post("/", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({ knowledgeRecordId: z.string(), reason: z.string().trim().min(5).max(500) })
      .parse(req.body);
    const record = await prisma.knowledgeRecord.findUnique({ where: { id: body.knowledgeRecordId } });
    if (!record || record.status !== "VERIFIED") return res.status(404).json({ error: "Record not found" });
    const dup = await prisma.report.findFirst({
      where: { userId: req.user!.id, knowledgeRecordId: record.id, status: "OPEN" },
    });
    if (dup) return res.status(400).json({ error: "You already reported this record" });
    const report = await prisma.report.create({
      data: { userId: req.user!.id, knowledgeRecordId: record.id, reason: body.reason },
      select: { id: true, status: true, createdAt: true },
    });
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

export default router;
