import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../services/prisma.js";
import { requireAuth, optionalAuth, AuthRequest, isStaff, requireRole } from "../middleware/auth.js";
import { publicRecordInclude, shapeRecord, PublicRecord } from "../services/serialize.js";
import { reviewRecord } from "../services/review.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

export const KNOWLEDGE_TYPES = ["history", "politics", "traditional", "education", "culture", "government", "person", "event"] as const;

/** Attach the viewer's vote + saved flag. */
export async function withViewer(records: PublicRecord[], userId?: string) {
  if (!userId || records.length === 0) return records.map((r) => shapeRecord(r));
  const ids = records.map((r) => r.id);
  const [votes, saves] = await Promise.all([
    prisma.vote.findMany({ where: { userId, knowledgeRecordId: { in: ids } } }),
    prisma.savedRecord.findMany({ where: { userId, knowledgeRecordId: { in: ids } } }),
  ]);
  const vm = new Map(votes.map((v) => [v.knowledgeRecordId, v.type]));
  const sm = new Set(saves.map((s) => s.knowledgeRecordId));
  return records.map((r) => shapeRecord(r, { myVote: vm.get(r.id) ?? null, saved: sm.has(r.id) }));
}

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  entity: z.string().optional(),
  mine: z.enum(["1", "true"]).optional(),
  status: z.enum(["DRAFT", "PENDING", "VERIFIED", "REJECTED"]).optional(),
  sort: z.enum(["recent", "top"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Public list. Returns VERIFIED records only, unless:
 *   - `mine=1` (signed in): your own records in any status
 *   - staff may pass `status=`
 */
router.get("/", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const where: Prisma.KnowledgeRecordWhereInput = {};
    if (q.mine) {
      if (!req.user) throw new HttpError(401, "Sign in to see your records");
      where.createdById = req.user.id;
      if (q.status) where.status = q.status;
    } else if (q.status && isStaff(req.user)) {
      where.status = q.status;
    } else {
      where.status = "VERIFIED";
    }
    if (q.type) where.type = q.type;
    if (q.entity) where.entities = { some: { entityId: q.entity } };
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: "insensitive" } },
        { content: { contains: q.q, mode: "insensitive" } },
        { placeText: { contains: q.q, mode: "insensitive" } },
      ];
    }
    const [records, total] = await Promise.all([
      prisma.knowledgeRecord.findMany({
        where,
        include: publicRecordInclude,
        orderBy: q.sort === "top" ? [{ sourceRank: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.knowledgeRecord.count({ where }),
    ]);
    res.json({
      records: await withViewer(records, req.user?.id),
      pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  } catch (err) {
    next(err);
  }
});

async function loadVisible(id: string, user?: AuthRequest["user"]) {
  const r = await prisma.knowledgeRecord.findUnique({ where: { id }, include: publicRecordInclude });
  if (!r) return null;
  if (r.status === "VERIFIED" || isStaff(user) || (user && r.createdById === user.id)) return r;
  return null;
}

router.get("/:id", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const r = await loadVisible(String(req.params.id), req.user);
    if (!r) return res.status(404).json({ error: "Record not found" });
    const [shaped] = await withViewer([r], req.user?.id);
    const revisions = await prisma.recordRevision.count({ where: { knowledgeRecordId: r.id } });
    res.json({ ...shaped, revisions });
  } catch (err) {
    next(err);
  }
});

/** Markdown export with attribution and citations. */
router.get("/:id/export", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const r = await loadVisible(String(req.params.id), req.user);
    if (!r) return res.status(404).json({ error: "Record not found" });
    const lines = [
      `# ${r.title}`,
      "",
      `*${r.type}${r.placeText ? ` · ${r.placeText}` : ""} · status: ${r.status}*`,
      "",
      r.content,
      "",
      "---",
      `Contributed by @${r.createdBy.username}` + (r.verifiedBy ? ` · verified by @${r.verifiedBy.username}` : ""),
      r.verifiedAt ? `Verified: ${r.verifiedAt.toISOString().slice(0, 10)}` : "",
      ...(r.citations.length
        ? ["", "Sources:", ...r.citations.map((c) => `- ${c.document.filename}${c.paragraph ? ` (${c.paragraph})` : ""}`)]
        : []),
      "",
      `Source: Aphring knowledge record ${r.id}`,
    ];
    const safe = r.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "record";
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.md"`);
    res.send(lines.filter((l) => l !== undefined).join("\n"));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  title: z.string().trim().min(3).max(300),
  content: z.string().trim().min(20).max(20000),
  type: z.enum(KNOWLEDGE_TYPES),
  placeText: z.string().trim().max(200).optional().nullable(),
});

/** Write a record by hand. Always PENDING; embedded only when verified. */
router.post("/", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const record = await prisma.knowledgeRecord.create({
      data: {
        title: body.title,
        content: body.content,
        type: body.type,
        placeText: body.placeText || null,
        status: "PENDING",
        createdById: req.user!.id,
      },
      include: publicRecordInclude,
    });
    res.status(201).json(shapeRecord(record));
  } catch (err) {
    next(err);
  }
});

/** Contributors may edit their own record while it is not yet verified. */
router.patch("/:id", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = createSchema.partial().parse(req.body);
    const id = String(req.params.id);
    const cur = await prisma.knowledgeRecord.findUnique({ where: { id } });
    if (!cur || cur.createdById !== req.user!.id) return res.status(404).json({ error: "Record not found" });
    if (cur.status === "VERIFIED") {
      return res.status(400).json({ error: "Verified records change through corrections" });
    }
    const record = await prisma.knowledgeRecord.update({
      where: { id },
      data: { ...body, status: "PENDING", reviewNote: null },
      include: publicRecordInclude,
    });
    res.json(shapeRecord(record));
  } catch (err) {
    next(err);
  }
});

/** Legacy status endpoint; delegates to the workstation review flow. */
router.patch("/:id/status", requireAuth, requireRole("ADMIN", "MODERATOR"), async (req: AuthRequest, res, next) => {
  try {
    const { status, reason } = z
      .object({ status: z.enum(["VERIFIED", "REJECTED", "PENDING"]), reason: z.string().max(1000).optional() })
      .parse(req.body);
    const record = await reviewRecord({
      recordId: String(req.params.id),
      reviewerId: req.user!.id,
      decision: status === "VERIFIED" ? "VERIFY" : status === "REJECTED" ? "REJECT" : "PENDING",
      note: reason,
    });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const cur = await prisma.knowledgeRecord.findUnique({ where: { id } });
    if (!cur) return res.status(404).json({ error: "Record not found" });
    const own = cur.createdById === req.user!.id && cur.status !== "VERIFIED";
    if (!own && req.user!.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
    await prisma.knowledgeRecord.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
