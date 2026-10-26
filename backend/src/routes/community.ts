/** Public social endpoints: leaderboard, public profiles, corrections. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { optionalAuth, requireAuth, AuthRequest } from "../middleware/auth.js";
import { getUserStats, deriveBadges, publicStats, recordMilestone, RECORD_MILESTONES } from "../services/badges.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

/**
 * One general leaderboard from VERIFIED work. Everyone is ranked together, including
 * moderators and admins, and the response never says who is staff.
 */
router.get("/leaderboard", async (req, res, next) => {
  try {
    const period = z.enum(["all", "month"]).default("all").parse(req.query.period);
    const since = period === "month" ? new Date(Date.now() - 30 * 86_400_000) : new Date(0);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; username: string; name: string; records: number; words: number; ups: number }>
    >(
      `SELECT u.id, u.username, u.name,
              COUNT(kr.id)::int AS records,
              COALESCE(SUM(array_length(regexp_split_to_array(trim(kr.content), '\\s+'), 1)), 0)::int AS words,
              COALESCE(SUM(kr.upvotes), 0)::int AS ups
       FROM users u
       JOIN knowledge_records kr ON kr.created_by = u.id AND kr.status = 'VERIFIED' AND kr.verified_at >= $1
       GROUP BY u.id
       ORDER BY records DESC, ups DESC
       LIMIT 200`,
      since
    );
    const contributors = rows
      .map((r) => ({
        username: r.username,
        name: r.name,
        records: r.records,
        words: r.words,
        ups: r.ups,
        score: r.records * 5 + r.ups,
        milestone: recordMilestone(r.records),
      }))
      .sort((a, b) => b.score - a.score || b.records - a.records)
      .slice(0, 100);
    res.json({ period, contributors, milestones: RECORD_MILESTONES });
  } catch (err) {
    next(err);
  }
});

router.get("/users/:username", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: String(req.params.username).toLowerCase() },
      select: { id: true, username: true, name: true, reputation: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const stats = await getUserStats(user.id);
    const recent = await prisma.knowledgeRecord.findMany({
      where: { createdById: user.id, status: "VERIFIED" },
      orderBy: { verifiedAt: "desc" },
      take: 10,
      select: { id: true, title: true, type: true, placeText: true, upvotes: true, verifiedAt: true },
    });
    const { id, ...pub } = user;
    // Public profiles never reveal staff roles (own role is visible on /api/me only).
    res.json({ user: pub, stats: publicStats(stats), ...deriveBadges(stats, "USER"), recent });
  } catch (err) {
    next(err);
  }
});

const correctionSchema = z.object({
  knowledgeRecordId: z.string(),
  field: z.enum(["TITLE", "CONTENT", "PLACE", "ENTITIES", "OTHER"]),
  proposedText: z.string().trim().min(2).max(20000),
  reason: z.string().trim().min(5).max(1000),
});

/** Propose a correction to a verified record. Corrections replace comment threads. */
router.post("/corrections", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = correctionSchema.parse(req.body);
    const rec = await prisma.knowledgeRecord.findUnique({ where: { id: body.knowledgeRecordId }, select: { status: true } });
    if (!rec || rec.status !== "VERIFIED") throw new HttpError(404, "Record not found");
    const open = await prisma.correction.count({
      where: { proposedById: req.user!.id, knowledgeRecordId: body.knowledgeRecordId, status: "PENDING" },
    });
    if (open >= 3) throw new HttpError(400, "You already have pending corrections on this record");
    const c = await prisma.correction.create({
      data: { ...body, proposedById: req.user!.id },
      select: { id: true, status: true, field: true, createdAt: true },
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
});

/** Public list of corrections on a verified record (no emails). */
router.get("/corrections", optionalAuth, async (req, res, next) => {
  try {
    const recordId = z.string().parse(req.query.recordId);
    const rec = await prisma.knowledgeRecord.findUnique({ where: { id: recordId }, select: { status: true } });
    if (!rec || rec.status !== "VERIFIED") return res.json([]);
    res.json(
      await prisma.correction.findMany({
        where: { knowledgeRecordId: recordId, status: { in: ["PENDING", "ACCEPTED"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          field: true,
          proposedText: true,
          reason: true,
          status: true,
          reviewNote: true,
          createdAt: true,
          reviewedAt: true,
          proposedBy: { select: { username: true, name: true } },
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

export default router;
