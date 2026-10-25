import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { recomputeSourceRank } from "../services/review.js";
import { bumpFromRecords, SIGNAL_WEIGHTS, track } from "../services/affinity.js";
import { HttpError } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

const voteSchema = z.object({ type: z.enum(["UP", "DOWN"]) });
const UP_REP = 1;

/**
 * Votes are a ranking signal only — they never change verification status.
 * Allowed on VERIFIED records. Atomic: counts, author reputation and rank move together,
 * and reputation is reversed on unvote / switch.
 */
router.post("/:recordId", async (req: AuthRequest, res, next) => {
  try {
    const recordId = String(req.params.recordId);
    const { type } = voteSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.knowledgeRecord.findUnique({ where: { id: recordId } });
      if (!record || record.status !== "VERIFIED") throw new HttpError(404, "Record not found");
      if (record.createdById === userId) throw new HttpError(400, "You cannot vote on your own record");

      const existing = await tx.vote.findUnique({
        where: { userId_knowledgeRecordId: { userId, knowledgeRecordId: recordId } },
      });
      let up = 0;
      let down = 0;
      let voted: "UP" | "DOWN" | null = type;
      if (existing && existing.type === type) {
        await tx.vote.delete({ where: { id: existing.id } });
        if (type === "UP") up = -1;
        else down = -1;
        voted = null;
      } else if (existing) {
        await tx.vote.update({ where: { id: existing.id }, data: { type } });
        up = type === "UP" ? 1 : -1;
        down = type === "DOWN" ? 1 : -1;
      } else {
        await tx.vote.create({ data: { userId, knowledgeRecordId: recordId, type } });
        if (type === "UP") up = 1;
        else down = 1;
      }
      await tx.knowledgeRecord.update({
        where: { id: recordId },
        data: { upvotes: { increment: up }, downvotes: { increment: down } },
      });
      if (up !== 0) {
        await tx.user.update({ where: { id: record.createdById }, data: { reputation: { increment: up * UP_REP } } });
      }
      await recomputeSourceRank(tx, recordId);
      const updated = await tx.knowledgeRecord.findUniqueOrThrow({
        where: { id: recordId },
        select: { upvotes: true, downvotes: true, sourceRank: true },
      });
      return { voted, ...updated };
    });

    if (result.voted) {
      track(bumpFromRecords(userId, [recordId], result.voted === "UP" ? SIGNAL_WEIGHTS.voteUp : SIGNAL_WEIGHTS.voteDown));
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
