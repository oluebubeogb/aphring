/**
 * Workstation API — ADMIN and MODERATOR only.
 * Moderators: review queue, corrections, reports, entities.
 * Admins additionally: moderator invites/revocation, ops status, reindex, audit log.
 */
import { Router } from "express";
import { z } from "zod";
import { EntityType, Prisma } from "@prisma/client";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";
import { reviewRecord } from "../services/review.js";
import { suggestEntities, mergeEntities, slugify, ENTITY_TYPES, cleanEntityName } from "../services/entities.js";
import { embedRecords, embeddingsEnabled, staleVerifiedIds } from "../services/embeddings.js";
import { audit } from "../services/roles.js";
import { getAdminUsernames, embeddingConfig, chatConfig } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { KNOWLEDGE_TYPES } from "./knowledge.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "MODERATOR"));
const adminOnly = requireRole("ADMIN");
const entityTypeEnum = z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]);

const staffRecordInclude = {
  createdBy: { select: { id: true, username: true, name: true, reputation: true } },
  verifiedBy: { select: { id: true, username: true } },
  citations: { select: { id: true, paragraph: true, page: true, document: { select: { id: true, filename: true, mimeType: true } } } },
  entities: { select: { source: true, entity: { select: { id: true, name: true, slug: true, entityType: true } } } },
  _count: { select: { reports: { where: { status: "OPEN" } }, corrections: { where: { status: "PENDING" } }, revisions: true } },
} satisfies Prisma.KnowledgeRecordInclude;

router.get("/stats", async (_req, res, next) => {
  try {
    const [users, moderators, pending, verified, rejected, reports, corrections, documents, entities] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "MODERATOR" } }),
      prisma.knowledgeRecord.count({ where: { status: "PENDING" } }),
      prisma.knowledgeRecord.count({ where: { status: "VERIFIED" } }),
      prisma.knowledgeRecord.count({ where: { status: "REJECTED" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.correction.count({ where: { status: "PENDING" } }),
      prisma.document.count(),
      prisma.entity.count({ where: { knowledgeLinks: { some: {} } } }),
    ]);
    res.json({ users, moderators, pending, verified, rejected, reports, corrections, documents, entities });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- queue

router.get("/queue", async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.enum(["PENDING", "VERIFIED", "REJECTED", "DRAFT"]).default("PENDING"),
        q: z.string().trim().max(200).optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const where: Prisma.KnowledgeRecordWhereInput = { status: q.status };
    if (q.q) where.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { content: { contains: q.q, mode: "insensitive" } }];
    const [records, total] = await Promise.all([
      prisma.knowledgeRecord.findMany({
        where,
        include: staffRecordInclude,
        orderBy: q.status === "PENDING" ? { createdAt: "asc" } : { updatedAt: "desc" },
        skip: (q.page - 1) * 25,
        take: 25,
      }),
      prisma.knowledgeRecord.count({ where }),
    ]);
    res.json({
      total,
      page: q.page,
      records: records.map((r) => ({ ...r, entities: r.entities.map((e) => ({ ...e.entity, source: e.source })) })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/records/:id", async (req, res, next) => {
  try {
    const r = await prisma.knowledgeRecord.findUnique({
      where: { id: String(req.params.id) },
      include: {
        ...staffRecordInclude,
        revisions: { orderBy: { createdAt: "desc" }, take: 20, include: { editedBy: { select: { username: true } } } },
      },
    });
    if (!r) return res.status(404).json({ error: "Record not found" });
    res.json({ ...r, entities: r.entities.map((e) => ({ ...e.entity, source: e.source })) });
  } catch (err) {
    next(err);
  }
});

/** Rule-based entity suggestions. No AI call. */
router.get("/records/:id/suggestions", async (req, res, next) => {
  try {
    const r = await prisma.knowledgeRecord.findUnique({ where: { id: String(req.params.id) } });
    if (!r) return res.status(404).json({ error: "Record not found" });
    res.json(await suggestEntities(r));
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  decision: z.enum(["VERIFY", "REJECT", "PENDING"]),
  reason: z.string().trim().max(1000).optional(),
  title: z.string().trim().min(3).max(300).optional(),
  content: z.string().trim().min(10).max(20000).optional(),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  place: z.string().trim().max(200).nullable().optional(),
  entities: z.array(z.object({ name: z.string().trim().min(2).max(120), type: entityTypeEnum })).max(40).optional(),
});

router.post("/records/:id/review", async (req: AuthRequest, res, next) => {
  try {
    const body = reviewSchema.parse(req.body);
    const record = await reviewRecord({
      recordId: String(req.params.id),
      reviewerId: req.user!.id,
      decision: body.decision,
      note: body.reason,
      title: body.title,
      content: body.content,
      type: body.type,
      place: body.place,
      entities: body.entities,
    });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- corrections

router.get("/corrections", async (req, res, next) => {
  try {
    const status = z.enum(["PENDING", "ACCEPTED", "REJECTED"]).default("PENDING").parse(req.query.status);
    res.json(
      await prisma.correction.findMany({
        where: { status },
        orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
        take: 100,
        include: {
          proposedBy: { select: { username: true, name: true, reputation: true } },
          reviewedBy: { select: { username: true } },
          knowledgeRecord: { select: { id: true, title: true, content: true, placeText: true, status: true } },
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Accepting a TITLE / CONTENT / PLACE correction applies it to the record
 * (writes a revision, keeps it VERIFIED, re-embeds only if the text hash changed).
 * `appliedText` lets the moderator tweak the proposal before applying.
 */
router.post("/corrections/:id/review", async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        decision: z.enum(["ACCEPT", "REJECT"]),
        note: z.string().trim().max(1000).optional(),
        appliedText: z.string().trim().min(2).max(20000).optional(),
      })
      .parse(req.body);
    const c = await prisma.correction.findUnique({ where: { id: String(req.params.id) }, include: { knowledgeRecord: true } });
    if (!c || c.status !== "PENDING") throw new HttpError(404, "Correction not found");
    if (body.decision === "REJECT" && !body.note) throw new HttpError(400, "A reason is required when rejecting");

    if (body.decision === "ACCEPT" && ["TITLE", "CONTENT", "PLACE"].includes(c.field)) {
      const text = body.appliedText || c.proposedText;
      await reviewRecord({
        recordId: c.knowledgeRecordId,
        reviewerId: req.user!.id,
        decision: c.knowledgeRecord.status === "VERIFIED" ? "VERIFY" : "PENDING",
        note: `Correction by contributor applied${body.note ? `: ${body.note}` : ""}`,
        title: c.field === "TITLE" ? text : undefined,
        content: c.field === "CONTENT" ? text : undefined,
        place: c.field === "PLACE" ? text : undefined,
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.correction.update({
        where: { id: c.id },
        data: {
          status: body.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
          reviewNote: body.note || null,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      if (body.decision === "ACCEPT") {
        await tx.user.update({ where: { id: c.proposedById }, data: { reputation: { increment: 2 } } });
      }
    });
    await audit(req.user!.id, `correction.${body.decision.toLowerCase()}`, c.id, { record: c.knowledgeRecordId, field: c.field });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- reports

router.get("/reports", async (req, res, next) => {
  try {
    const status = z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN").parse(req.query.status);
    res.json(
      await prisma.report.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { username: true, name: true } },
          knowledgeRecord: { select: { id: true, title: true, content: true, status: true } },
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

/** Resolve or dismiss. `unpublish` moves the record back to PENDING (out of public view). */
router.patch("/reports/:id", async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(["RESOLVED", "DISMISSED"]), unpublish: z.boolean().optional(), note: z.string().max(1000).optional() })
      .parse(req.body);
    const report = await prisma.report.update({ where: { id: String(req.params.id) }, data: { status: body.status } });
    if (body.unpublish) {
      await reviewRecord({
        recordId: report.knowledgeRecordId,
        reviewerId: req.user!.id,
        decision: "PENDING",
        note: body.note || "Unpublished after a report",
      });
    }
    await audit(req.user!.id, `report.${body.status.toLowerCase()}`, report.id, { unpublish: !!body.unpublish });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- entities

router.get("/entities", async (req, res, next) => {
  try {
    const q = z
      .object({ type: entityTypeEnum.optional(), q: z.string().trim().max(100).optional(), catalog: z.enum(["0", "1"]).optional() })
      .parse(req.query);
    const where: Prisma.EntityWhereInput = {};
    if (q.type) where.entityType = q.type;
    if (q.q) where.name = { contains: q.q, mode: "insensitive" };
    if (q.catalog !== "1") where.knowledgeLinks = { some: {} };
    res.json(
      await prisma.entity.findMany({
        where,
        orderBy: { name: "asc" },
        take: 200,
        include: { _count: { select: { knowledgeLinks: true } } },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.patch("/entities/:id", async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        aliases: z.array(z.string().trim().min(2).max(120)).max(30).optional(),
        type: entityTypeEnum.optional(),
      })
      .parse(req.body);
    const data: Prisma.EntityUpdateInput = {};
    if (body.name) {
      data.name = cleanEntityName(body.name);
      data.slug = slugify(body.name);
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.aliases) data.aliases = body.aliases;
    if (body.type) data.entityType = body.type;
    try {
      const e = await prisma.entity.update({ where: { id: String(req.params.id) }, data });
      await audit(req.user!.id, "entity.update", e.id, body);
      res.json(e);
    } catch (e: any) {
      if (e?.code === "P2002") throw new HttpError(409, "An entity with that name and type exists — merge instead");
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

router.post("/entities/:id/merge", async (req: AuthRequest, res, next) => {
  try {
    const { targetId } = z.object({ targetId: z.string() }).parse(req.body);
    await mergeEntities(String(req.params.id), targetId);
    await audit(req.user!.id, "entity.merge", targetId, { from: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/entities/:id", adminOnly, async (req: AuthRequest, res, next) => {
  try {
    await prisma.entity.delete({ where: { id: String(req.params.id) } });
    await audit(req.user!.id, "entity.delete", String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- people (admin)

router.get("/users", adminOnly, async (req, res, next) => {
  try {
    const q = z.string().trim().max(100).optional().parse(req.query.q);
    const users = await prisma.user.findMany({
      where: q ? { OR: [{ username: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }] } : {},
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        reputation: true,
        createdAt: true,
        _count: { select: { knowledgeRecords: true, documents: true } },
        invitesReceived: { where: { status: "PENDING" }, select: { id: true, createdAt: true } },
      },
      orderBy: [{ role: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    const envAdmins = new Set(getAdminUsernames());
    res.json(users.map((u) => ({ ...u, envAdmin: envAdmins.has(u.username) })));
  } catch (err) {
    next(err);
  }
});

/** Invite an already-registered username to become a moderator. */
router.post("/invites", adminOnly, async (req: AuthRequest, res, next) => {
  try {
    const { username } = z.object({ username: z.string().trim().toLowerCase().min(3).max(30) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new HttpError(404, `No registered user @${username}`);
    if (user.role !== "USER") throw new HttpError(400, `@${username} is already ${user.role.toLowerCase()}`);
    const existing = await prisma.modInvite.findFirst({ where: { userId: user.id, status: "PENDING" } });
    if (existing) throw new HttpError(400, "An invite is already pending");
    const invite = await prisma.modInvite.create({ data: { userId: user.id, invitedById: req.user!.id } });
    await audit(req.user!.id, "invite.create", invite.id, { username });
    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
});

router.get("/invites", adminOnly, async (_req, res, next) => {
  try {
    res.json(
      await prisma.modInvite.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { username: true, name: true } }, invitedBy: { select: { username: true } } },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.delete("/invites/:id", adminOnly, async (req: AuthRequest, res, next) => {
  try {
    const inv = await prisma.modInvite.findUnique({ where: { id: String(req.params.id) } });
    if (!inv || inv.status !== "PENDING") throw new HttpError(404, "Invite not found");
    await prisma.modInvite.update({ where: { id: inv.id }, data: { status: "REVOKED", respondedAt: new Date() } });
    await audit(req.user!.id, "invite.revoke", inv.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Remove moderator role. Admin role is controlled only by ADMIN_USERNAMES. */
router.post("/users/:id/revoke-moderator", adminOnly, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user || user.role !== "MODERATOR") throw new HttpError(400, "User is not a moderator");
    await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
    await audit(req.user!.id, "role.moderator_revoked", user.id, { username: user.username });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- ops (admin, read-only status)

router.get("/ops", adminOnly, async (_req, res, next) => {
  try {
    const cfg = embeddingConfig();
    const [stale, embedded] = await Promise.all([
      staleVerifiedIds(100000).then((x) => x.length),
      prisma.knowledgeRecord.count({ where: { status: "VERIFIED", embeddedAt: { not: null } } }),
    ]);
    res.json({
      envAdmins: [...getAdminUsernames()],
      embeddings: { enabled: embeddingsEnabled(), fake: cfg.fake, model: cfg.model, embedded, stale },
      chatModel: { configured: chatConfig().configured, model: chatConfig().model || null },
      stt: { configured: !!process.env.OPENAI_API_KEY },
    });
  } catch (err) {
    next(err);
  }
});

/** Embed verified records whose text changed since last embedding. Batched. */
router.post("/reindex", adminOnly, async (req: AuthRequest, res, next) => {
  try {
    if (!embeddingsEnabled()) throw new HttpError(400, "Embeddings are not configured");
    const ids = await staleVerifiedIds(2000);
    const done = await embedRecords(ids);
    await audit(req.user!.id, "ops.reindex", undefined, { requested: ids.length, embedded: done });
    res.json({ requested: ids.length, embedded: done });
  } catch (err) {
    next(err);
  }
});

router.get("/audit", adminOnly, async (_req, res, next) => {
  try {
    res.json(
      await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { actor: { select: { username: true } } },
      })
    );
  } catch (err) {
    next(err);
  }
});

export default router;
