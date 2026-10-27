/**
 * Pins / Promoted records — the right-rail feature.
 *
 *  - FORCED pins show to everyone.
 *  - RELATIONAL pins only show when they fit the viewer: entity overlap with the
 *    active screen (entityId / type params) and the signed-in user's UserAffinity weights.
 *  - sortOrder: lower = higher step on the stack (pyramid order, top → bottom).
 *  - Analytics (impressions, clicks) are visible only to ADMINs and the record owner.
 *
 * Public:  GET /api/pins/rail, POST /api/pins/:id/impression, POST /api/pins/:id/click
 * Owner:   GET /api/pins/record/:recordId/analytics (also /api/knowledge/:id/pin-analytics)
 * Admin:   /api/workstation/pins (see pinsAdminRouter)
 */
import { Router, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PinMode, Prisma } from "@prisma/client";
import { prisma } from "../services/prisma.js";
import { optionalAuth, requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";
import { getAffinityMap } from "../services/affinity.js";
import { audit } from "../services/roles.js";
import { HttpError } from "../middleware/error.js";

const RAIL_CAP = 6;
/** Minimum relevance a RELATIONAL pin needs before it is shown. */
const RELATIONAL_MIN_SCORE = 1;

const railRecordSelect = {
  id: true,
  title: true,
  type: true,
  placeText: true,
  content: true,
  status: true,
  createdById: true,
  entities: { select: { entity: { select: { id: true, name: true, slug: true, entityType: true } } } },
} satisfies Prisma.KnowledgeRecordSelect;

type RailRecord = Prisma.KnowledgeRecordGetPayload<{ select: typeof railRecordSelect }>;

function snippet(text: string, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

function cardLite(r: RailRecord) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    placeText: r.placeText,
    snippet: snippet(r.content),
    entities: r.entities.slice(0, 4).map((e) => ({ id: e.entity.id, name: e.entity.name, slug: e.entity.slug, type: e.entity.entityType })),
  };
}

function csv(v: unknown, max = 20): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, max);
}

/**
 * Relational score:
 *   +3 per entity shared with the active screen (entity page / record entities)
 *   +2 if the record's knowledge type matches the screen's type
 *   +1 if one of the record's entities is of the screen's entity type (e.g. /explore/school)
 *   + sum of the viewer's decayed affinity weights on the record's entities (capped at 5)
 */
function relationalScore(r: RailRecord, ctxEntities: Set<string>, ctxTypes: Set<string>, ctxEntityType: string | null, affinity: Map<string, number>) {
  let score = 0;
  for (const e of r.entities) if (ctxEntities.has(e.entity.id)) score += 3;
  if (ctxTypes.has(String(r.type).toLowerCase())) score += 2;
  if (ctxEntityType && r.entities.some((e) => String(e.entity.entityType).toUpperCase() === ctxEntityType)) score += 1;
  let aff = 0;
  for (const e of r.entities) aff += Math.max(0, affinity.get(e.entity.id) || 0);
  score += Math.min(5, aff);
  return score;
}

export const pinsPublicRouter = Router();

pinsPublicRouter.get("/rail", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = z
      .object({
        entityId: z.string().max(1000).optional(),
        entityType: z.string().max(40).optional(),
        type: z.string().max(200).optional(),
        path: z.string().max(300).optional(),
        exclude: z.string().max(100).optional(),
      })
      .parse(req.query);

    const ctxEntities = new Set(csv(q.entityId));
    const ctxTypes = new Set(csv(q.type, 8).map((t) => t.toLowerCase()));
    const ctxEntityType = q.entityType ? q.entityType.trim().toUpperCase() : null;
    const affinity = req.user ? await getAffinityMap(req.user.id) : new Map<string, number>();

    const pins = await prisma.pinnedRecord.findMany({
      where: { active: true, knowledgeRecord: { status: "VERIFIED" }, ...(q.exclude ? { knowledgeRecordId: { not: q.exclude } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 60,
      include: { knowledgeRecord: { select: railRecordSelect } },
    });

    const shown = pins
      .map((p) => {
        const score = p.mode === "FORCED" ? Infinity : relationalScore(p.knowledgeRecord, ctxEntities, ctxTypes, ctxEntityType, affinity);
        return { p, score };
      })
      .filter(({ p, score }) => p.mode === "FORCED" || score >= RELATIONAL_MIN_SCORE)
      // Pyramid order is the admin's sortOrder; relevance only decides *whether* a relational pin shows.
      .sort((a, b) => a.p.sortOrder - b.p.sortOrder || a.p.createdAt.getTime() - b.p.createdAt.getTime())
      .slice(0, RAIL_CAP);

    res.json({
      pins: shown.map(({ p }, i) => ({
        id: p.id,
        mode: p.mode,
        sortOrder: p.sortOrder,
        step: i,
        record: cardLite(p.knowledgeRecord),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

function eventHandler(type: "IMPRESSION" | "CLICK") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ path: z.string().max(300).optional() }).parse(req.body || {});
      const pin = await prisma.pinnedRecord.findUnique({ where: { id: String(req.params.id) }, select: { id: true, active: true } });
      if (!pin || !pin.active) return res.status(404).json({ error: "Pin not found" });
      const context = body.path ? body.path.split("?")[0].slice(0, 200) : null;
      await prisma.$transaction([
        prisma.pinnedRecord.update({
          where: { id: pin.id },
          data: type === "CLICK" ? { clickCount: { increment: 1 } } : { impressionCount: { increment: 1 } },
        }),
        prisma.pinEvent.create({ data: { pinId: pin.id, type, userId: req.user?.id ?? null, context } }),
      ]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  };
}

pinsPublicRouter.post("/:id/impression", eventLimiter, optionalAuth, eventHandler("IMPRESSION"));
pinsPublicRouter.post("/:id/click", eventLimiter, optionalAuth, eventHandler("CLICK"));

async function analyticsFor(pinId: string, events = 20) {
  const [daily, recent] = await Promise.all([
    prisma.$queryRaw<{ day: Date; impressions: bigint; clicks: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*) FILTER (WHERE type = 'IMPRESSION') AS impressions,
             COUNT(*) FILTER (WHERE type = 'CLICK') AS clicks
      FROM pin_events WHERE pin_id = ${pinId} AND created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`,
    events
      ? prisma.pinEvent.findMany({
          where: { pinId },
          orderBy: { createdAt: "desc" },
          take: events,
          select: { id: true, type: true, context: true, createdAt: true, user: { select: { username: true } } },
        })
      : Promise.resolve([]),
  ]);
  return {
    daily: daily.map((d) => ({ day: d.day, impressions: Number(d.impressions), clicks: Number(d.clicks) })),
    recent,
  };
}

/** Owner / admin analytics for one record's pin. Returns { pinned: false } when not pinned. */
export async function recordPinAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const recordId = String(req.params.recordId || String(req.params.id));
    const record = await prisma.knowledgeRecord.findUnique({ where: { id: recordId }, select: { createdById: true, pin: true } });
    if (!record) return res.status(404).json({ error: "Not found" });
    const isAdmin = req.user.role === "ADMIN";
    if (!isAdmin && record.createdById !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    const pin = record.pin;
    if (!pin) return res.json({ pinned: false });
    const a = await analyticsFor(pin.id, isAdmin ? 20 : 0);
    const ctr = pin.impressionCount ? pin.clickCount / pin.impressionCount : 0;
    res.json({
      pinned: true,
      pin: { id: pin.id, mode: pin.mode, active: pin.active, sortOrder: pin.sortOrder, impressions: pin.impressionCount, clicks: pin.clickCount, ctr },
      daily: a.daily,
      // Viewer identities are admin-only.
      recent: isAdmin ? a.recent : undefined,
    });
  } catch (err) {
    next(err);
  }
}

pinsPublicRouter.get("/record/:recordId/analytics", requireAuth, recordPinAnalytics);

// ---------------------------------------------------------------- admin (mounted at /api/workstation/pins)

export const pinsAdminRouter = Router();
pinsAdminRouter.use(requireAuth, requireRole("ADMIN"));

const modeEnum = z.nativeEnum(PinMode);

const adminPinInclude = {
  knowledgeRecord: {
    select: { id: true, title: true, type: true, status: true, placeText: true, createdBy: { select: { id: true, username: true } } },
  },
  pinnedBy: { select: { id: true, username: true } },
} satisfies Prisma.PinnedRecordInclude;

pinsAdminRouter.get("/", async (_req, res, next) => {
  try {
    const pins = await prisma.pinnedRecord.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: adminPinInclude,
    });
    res.json({ pins });
  } catch (err) {
    next(err);
  }
});

/** Verified records to pick from (search by title). */
pinsAdminRouter.get("/candidates", async (req, res, next) => {
  try {
    const q = z.object({ q: z.string().trim().max(200).optional() }).parse(req.query);
    const records = await prisma.knowledgeRecord.findMany({
      where: { status: "VERIFIED", ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}) },
      orderBy: { verifiedAt: "desc" },
      take: 20,
      select: { id: true, title: true, type: true, placeText: true, pin: { select: { id: true } } },
    });
    res.json({ records: records.map((r) => ({ ...r, pinned: !!r.pin, pin: undefined })) });
  } catch (err) {
    next(err);
  }
});

pinsAdminRouter.post("/", async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        knowledgeRecordId: z.string().min(1),
        mode: modeEnum.default("FORCED"),
        sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const record = await prisma.knowledgeRecord.findUnique({ where: { id: body.knowledgeRecordId }, select: { status: true, pin: true } });
    if (!record) throw new HttpError(404, "Record not found");
    if (record.status !== "VERIFIED") throw new HttpError(400, "Only verified records can be pinned");
    if (record.pin) throw new HttpError(409, "This record is already pinned — edit the existing pin");
    let sortOrder = body.sortOrder;
    if (sortOrder === undefined) {
      const last = await prisma.pinnedRecord.aggregate({ _max: { sortOrder: true } });
      sortOrder = (last._max.sortOrder ?? 0) + 10;
    }
    const pin = await prisma.pinnedRecord.create({
      data: { knowledgeRecordId: body.knowledgeRecordId, mode: body.mode, sortOrder, note: body.note || null, pinnedById: req.user!.id },
      include: adminPinInclude,
    });
    await audit(req.user!.id, "pin.create", pin.id, { recordId: body.knowledgeRecordId, mode: body.mode, sortOrder });
    res.status(201).json({ pin });
  } catch (err) {
    next(err);
  }
});

/** Bulk reorder: body { order: [pinId, …] } top → bottom; rewrites sortOrder as 10, 20, 30… */
pinsAdminRouter.post("/reorder", async (req: AuthRequest, res, next) => {
  try {
    const { order } = z.object({ order: z.array(z.string()).min(1).max(200) }).parse(req.body);
    await prisma.$transaction(order.map((id, i) => prisma.pinnedRecord.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
    await audit(req.user!.id, "pin.reorder", undefined, { count: order.length });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

pinsAdminRouter.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        mode: modeEnum.optional(),
        sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
        active: z.boolean().optional(),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(req.body);
    const pin = await prisma.pinnedRecord.update({ where: { id: String(req.params.id) }, data: body, include: adminPinInclude });
    await audit(req.user!.id, "pin.update", pin.id, body);
    res.json({ pin });
  } catch (err) {
    next(err);
  }
});

/** Removes the pin row (and its event log). Use PATCH active=false to pause and keep analytics. */
pinsAdminRouter.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    await prisma.pinnedRecord.delete({ where: { id: String(req.params.id) } });
    await audit(req.user!.id, "pin.delete", String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

pinsAdminRouter.get("/:id/analytics", async (req, res, next) => {
  try {
    const pin = await prisma.pinnedRecord.findUnique({ where: { id: String(req.params.id) }, include: adminPinInclude });
    if (!pin) return res.status(404).json({ error: "Pin not found" });
    const a = await analyticsFor(pin.id, 50);
    res.json({
      pin,
      impressions: pin.impressionCount,
      clicks: pin.clickCount,
      ctr: pin.impressionCount ? pin.clickCount / pin.impressionCount : 0,
      ...a,
    });
  } catch (err) {
    next(err);
  }
});
