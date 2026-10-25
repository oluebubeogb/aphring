import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";
import { publicRecordInclude } from "../services/serialize.js";
import { withViewer } from "./knowledge.js";
import { getAffinityMap } from "../services/affinity.js";

const router = Router();

/** Social feed of VERIFIED records. `foryou` ranks by the viewer's entity affinities. */
router.get("/", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = z
      .object({
        tab: z.enum(["recent", "top", "foryou"]).default("recent"),
        page: z.coerce.number().int().min(1).max(500).default(1),
        limit: z.coerce.number().int().min(1).max(30).default(15),
      })
      .parse(req.query);
    const skip = (q.page - 1) * q.limit;
    let tab = q.tab;
    let records;

    if (tab === "foryou" && req.user) {
      const aff = await getAffinityMap(req.user.id);
      const liked = [...aff.entries()].filter(([, w]) => w > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 50);
      if (liked.length) {
        const ids = liked.map(([id]) => id);
        const candidates = await prisma.knowledgeRecord.findMany({
          where: { status: "VERIFIED", entities: { some: { entityId: { in: ids } } } },
          include: publicRecordInclude,
          orderBy: { verifiedAt: "desc" },
          take: 300,
        });
        const w = new Map(liked);
        const scored = candidates
          .map((r) => {
            const a = r.entities.reduce((s, e) => s + (w.get(e.entity.id) || 0), 0);
            const days = r.verifiedAt ? (Date.now() - r.verifiedAt.getTime()) / 86_400_000 : 365;
            return { r, s: a + r.sourceRank * 0.1 + 3 * Math.exp(-days / 14) };
          })
          .sort((a, b) => b.s - a.s);
        records = scored.slice(skip, skip + q.limit).map((x) => x.r);
      }
    }
    if (!records) {
      if (tab === "foryou") tab = "top";
      records = await prisma.knowledgeRecord.findMany({
        where: { status: "VERIFIED" },
        include: publicRecordInclude,
        orderBy: tab === "top" ? [{ sourceRank: "desc" }, { verifiedAt: "desc" }] : [{ verifiedAt: "desc" }],
        skip,
        take: q.limit,
      });
    }
    res.json({ tab, page: q.page, records: await withViewer(records, req.user?.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
