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
import { readStoredFile } from "../services/storage.js";
import { detectDocument, extractDocumentText, splitDocument } from "../services/text.js";
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
        documentId: z.string().trim().max(64).optional(),
      })
      .parse(req.query);
    const where: Prisma.KnowledgeRecordWhereInput = { status: q.status };
    if (q.documentId) where.citations = { some: { documentId: q.documentId } };
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

// ---------------------------------------------------------------- bulk review

const bulkSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
  decision: z.enum(["VERIFY", "REJECT"]),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Verify or reject many records at once. Each record goes through the same
 * reviewRecord() path as a single review (revision, reputation, entity links, audit).
 * Verify keeps existing entity links and adds known entities the text mentions.
 * Embeddings (if configured) run once for the whole batch.
 */
router.post("/records/bulk-review", async (req: AuthRequest, res, next) => {
  try {
    const body = bulkSchema.parse(req.body);
    if (body.decision === "REJECT" && !body.reason) throw new HttpError(400, "A reason is required when rejecting");
    const ids = [...new Set(body.ids)];
    const done: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        let entities: { name: string; type: EntityType }[] | undefined;
        if (body.decision === "VERIFY") {
          const r = await prisma.knowledgeRecord.findUnique({
            where: { id },
            include: { entities: { include: { entity: { select: { name: true, entityType: true } } } } },
          });
          if (!r) throw new HttpError(404, "Record not found");
          const map = new Map<string, { name: string; type: EntityType }>();
          for (const l of r.entities) {
            if (l.source === "TOPIC" || l.source === "PLACE") continue;
            map.set(`${l.entity.entityType}:${slugify(l.entity.name)}`, { name: l.entity.name, type: l.entity.entityType });
          }
          for (const sgg of await suggestEntities(r)) {
            if (!sgg.existingId || sgg.type === "TOPIC") continue;
            map.set(`${sgg.type}:${slugify(sgg.name)}`, { name: sgg.name, type: sgg.type });
          }
          entities = [...map.values()].slice(0, 40);
        }
        await reviewRecord({
          recordId: id,
          reviewerId: req.user!.id,
          decision: body.decision,
          note: body.reason,
          entities,
          skipEmbed: true,
        });
        done.push(id);
      } catch (e: any) {
        failed.push({ id, error: e?.message || "Failed" });
      }
    }
    if (body.decision === "VERIFY" && done.length) {
      embedRecords(done).catch((e) => console.error("Bulk embed failed:", e?.message || e));
    }
    await audit(req.user!.id, `record.bulk_${body.decision.toLowerCase()}`, undefined, { count: done.length, failed: failed.length });
    res.json({ ok: done.length, failed });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- documents / re-chunk

router.get("/documents", async (req, res, next) => {
  try {
    const q = z.object({ q: z.string().trim().max(200).optional() }).parse(req.query);
    const docs = await prisma.document.findMany({
      where: q.q ? { filename: { contains: q.q, mode: "insensitive" } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        placeText: true,
        createdAt: true,
        uploadedBy: { select: { username: true } },
        citations: { select: { knowledgeRecord: { select: { status: true } } } },
      },
    });
    res.json(
      docs.map(({ citations, ...d }) => {
        const counts = { PENDING: 0, VERIFIED: 0, REJECTED: 0, DRAFT: 0 } as Record<string, number>;
        for (const c of citations) counts[c.knowledgeRecord.status] = (counts[c.knowledgeRecord.status] || 0) + 1;
        return { ...d, counts };
      })
    );
  } catch (err) {
    next(err);
  }
});

/** Ids of records from one document with a given status (for "select all from this document"). */
router.get("/documents/:id/record-ids", async (req, res, next) => {
  try {
    const status = z.enum(["PENDING", "VERIFIED", "REJECTED", "DRAFT"]).default("PENDING").parse(req.query.status);
    const rows = await prisma.knowledgeRecord.findMany({
      where: { status, citations: { some: { documentId: String(req.params.id) } } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    res.json({ ids: rows.map((r) => r.id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Re-chunk a document from its stored original with the current splitter.
 * Creates NEW PENDING drafts only. VERIFIED records are never touched.
 * `supersedePending` (default true) rejects this document's older PENDING drafts
 * with the note "Superseded by re-chunk" so the queue isn't doubled.
 */
router.post("/documents/:id/rechunk", async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({ supersedePending: z.boolean().default(true) }).parse(req.body || {});
    const doc = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      include: { citations: { select: { knowledgeRecord: { select: { id: true, status: true, type: true } } } } },
    });
    if (!doc) throw new HttpError(404, "Document not found");

    let buffer: Buffer;
    try {
      buffer = await readStoredFile(doc.path);
    } catch {
      throw new HttpError(409, "The original file is missing from storage, so it can't be re-chunked.");
    }
    const { kind } = detectDocument(doc.filename, buffer);
    const raw = await extractDocumentText(kind, buffer);
    const { subject, records: drafts } = splitDocument(raw, { filename: doc.filename });
    if (!drafts.length) throw new HttpError(400, "No readable text found in the stored file.");

    const linked = doc.citations.map((c) => c.knowledgeRecord);
    const typeCounts = new Map<string, number>();
    for (const r of linked) typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
    const type = ([...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "history") as (typeof KNOWLEDGE_TYPES)[number];
    const oldPending = linked.filter((r) => r.status === "PENDING").map((r) => r.id);
    const verifiedKept = linked.filter((r) => r.status === "VERIFIED").length;

    const created = await prisma.$transaction(async (tx) => {
      if (body.supersedePending && oldPending.length) {
        await tx.knowledgeRecord.updateMany({
          where: { id: { in: oldPending }, status: "PENDING" },
          data: { status: "REJECTED", reviewNote: "Superseded by re-chunk" },
        });
      }
      const out: { id: string; title: string }[] = [];
      for (const [i, d] of drafts.entries()) {
        out.push(
          await tx.knowledgeRecord.create({
            data: {
              title: d.title,
              content: d.content,
              type,
              placeText: doc.placeText,
              status: "PENDING",
              createdById: doc.uploadedById,
              citations: { create: { documentId: doc.id, paragraph: `Re-chunk · part ${i + 1} of ${drafts.length}` } },
            },
            select: { id: true, title: true },
          })
        );
      }
      return out;
    });

    await audit(req.user!.id, "document.rechunk", doc.id, {
      created: created.length,
      supersededPending: body.supersedePending ? oldPending.length : 0,
      verifiedKept,
      subject,
    });
    res.json({
      created: created.length,
      records: created,
      supersededPending: body.supersedePending ? oldPending.length : 0,
      verifiedKept,
      subject,
      message:
        `Created ${created.length} new draft(s)` +
        (body.supersedePending && oldPending.length ? `, retired ${oldPending.length} old pending draft(s)` : "") +
        (verifiedKept ? `. ${verifiedKept} verified record(s) from this document were left untouched — reject them manually if the new drafts replace them.` : "."),
    });
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
