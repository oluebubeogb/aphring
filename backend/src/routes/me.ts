import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { getUserStats, deriveBadges } from "../services/badges.js";
import { publicRecordInclude } from "../services/serialize.js";
import { withViewer } from "./knowledge.js";
import { audit } from "../services/roles.js";
import { bumpFromRecords, SIGNAL_WEIGHTS, track } from "../services/affinity.js";
import { HttpError } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

router.get("/profile", async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, username: true, name: true, email: true, role: true, reputation: true, createdAt: true, emailVerifiedAt: true },
    });
    const stats = await getUserStats(user.id);
    const counts = await prisma.knowledgeRecord.groupBy({
      by: ["status"],
      where: { createdById: user.id },
      _count: true,
    });
    res.json({
      user,
      stats,
      submissions: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      ...deriveBadges(stats, user.role),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/invites", async (req: AuthRequest, res, next) => {
  try {
    res.json(
      await prisma.modInvite.findMany({
        where: { userId: req.user!.id, status: "PENDING" },
        include: { invitedBy: { select: { username: true, name: true } } },
        orderBy: { createdAt: "desc" },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post("/invites/:id/:action(accept|decline)", async (req: AuthRequest, res, next) => {
  try {
    const action = String(req.params.action);
    const invite = await prisma.modInvite.findUnique({ where: { id: String(req.params.id) } });
    if (!invite || invite.userId !== req.user!.id || invite.status !== "PENDING") {
      throw new HttpError(404, "Invite not found");
    }
    await prisma.$transaction(async (tx) => {
      await tx.modInvite.update({
        where: { id: invite.id },
        data: { status: action === "accept" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
      });
      // Admins stay admins (env-controlled); everyone else becomes MODERATOR on accept.
      if (action === "accept" && req.user!.role === "USER") {
        await tx.user.update({ where: { id: req.user!.id }, data: { role: "MODERATOR" } });
      }
    });
    await audit(req.user!.id, `invite.${action}`, invite.id);
    res.json({ ok: true, role: action === "accept" && req.user!.role === "USER" ? "MODERATOR" : req.user!.role });
  } catch (err) {
    next(err);
  }
});

router.get("/saves", async (req: AuthRequest, res, next) => {
  try {
    const saves = await prisma.savedRecord.findMany({
      where: { userId: req.user!.id, knowledgeRecord: { status: "VERIFIED" } },
      orderBy: { createdAt: "desc" },
      include: { knowledgeRecord: { include: publicRecordInclude } },
      take: 200,
    });
    res.json(await withViewer(saves.map((s) => s.knowledgeRecord), req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** Toggle save on a verified record. */
router.post("/saves/:recordId", async (req: AuthRequest, res, next) => {
  try {
    const recordId = String(req.params.recordId);
    const userId = req.user!.id;
    const rec = await prisma.knowledgeRecord.findUnique({ where: { id: recordId }, select: { status: true } });
    if (!rec || rec.status !== "VERIFIED") throw new HttpError(404, "Record not found");
    const key = { userId_knowledgeRecordId: { userId, knowledgeRecordId: recordId } };
    const existing = await prisma.savedRecord.findUnique({ where: key });
    if (existing) {
      await prisma.savedRecord.delete({ where: key });
      return res.json({ saved: false });
    }
    await prisma.savedRecord.create({ data: { userId, knowledgeRecordId: recordId } });
    track(bumpFromRecords(userId, [recordId], SIGNAL_WEIGHTS.save));
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
});

/** Clear personalisation signals. */
router.delete("/affinity", async (req: AuthRequest, res, next) => {
  try {
    await prisma.userAffinity.deleteMany({ where: { userId: req.user!.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
