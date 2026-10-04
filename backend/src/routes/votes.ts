import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const voteSchema = z.object({
  type: z.enum(["UP", "DOWN"]),
});

router.post("/:recordId", async (req: AuthRequest, res, next) => {
  try {
    const recordId = String(req.params.recordId);
    const { type } = voteSchema.parse(req.body);
    const userId = req.user!.id;

    const record = await prisma.knowledgeRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) return res.status(404).json({ error: "Record not found" });

    const existing = await prisma.vote.findUnique({
      where: {
        userId_knowledgeRecordId: { userId, knowledgeRecordId: recordId },
      },
    });

    if (existing) {
      if (existing.type === type) {
        // Toggle off
        await prisma.vote.delete({ where: { id: existing.id } });
        const field = type === "UP" ? "upvotes" : "downvotes";
        await prisma.knowledgeRecord.update({
          where: { id: recordId },
          data: { [field]: { decrement: 1 } },
        });
        await recomputeSourceRank(recordId);
        return res.json({ voted: null });
      }
      // Switch vote
      await prisma.vote.update({
        where: { id: existing.id },
        data: { type },
      });
      await prisma.knowledgeRecord.update({
        where: { id: recordId },
        data: {
          upvotes: { increment: type === "UP" ? 1 : -1 },
          downvotes: { increment: type === "DOWN" ? 1 : -1 },
        },
      });
    } else {
      await prisma.vote.create({
        data: { userId, knowledgeRecordId: recordId, type },
      });
      const field = type === "UP" ? "upvotes" : "downvotes";
      await prisma.knowledgeRecord.update({
        where: { id: recordId },
        data: { [field]: { increment: 1 } },
      });
      // Reputation for author on upvote
      if (type === "UP") {
        await prisma.user.update({
          where: { id: record.createdById },
          data: { reputation: { increment: 1 } },
        });
      }
    }

    await recomputeSourceRank(recordId);
    const updated = await prisma.knowledgeRecord.findUnique({
      where: { id: recordId },
      select: { upvotes: true, downvotes: true, sourceRank: true },
    });
    res.json({ voted: type, ...updated });
  } catch (err) {
    next(err);
  }
});

async function recomputeSourceRank(recordId: string) {
  const r = await prisma.knowledgeRecord.findUnique({
    where: { id: recordId },
  });
  if (!r) return;
  // Simple ranking: upvotes - downvotes + verified bonus
  const rank =
    r.upvotes - r.downvotes + (r.status === "VERIFIED" ? 10 : 0);
  await prisma.knowledgeRecord.update({
    where: { id: recordId },
    data: { sourceRank: rank },
  });
}

export default router;
