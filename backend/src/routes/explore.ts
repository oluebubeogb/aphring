import { Router } from "express";
import { z } from "zod";
import { EntityType } from "@prisma/client";
import { prisma } from "../services/prisma.js";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";
import { buildExplore } from "../services/explore.js";
import { ENTITY_TYPES, SHELF_LABELS } from "../services/entities.js";
import { bumpEntities, SIGNAL_WEIGHTS, track } from "../services/affinity.js";
import { publicRecordInclude } from "../services/serialize.js";
import { withViewer } from "./knowledge.js";

const router = Router();
router.use(optionalAuth);

/** Shelves (types with ≥1 verified record), personalised when signed in. No AI calls. */
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const seed = typeof req.query.seed === "string" ? req.query.seed.slice(0, 64) : undefined;
    res.json(await buildExplore({ userId: req.user?.id, seed }));
  } catch (err) {
    next(err);
  }
});

/** Which shelf types have content: counts > 0 only. */
router.get("/types", async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ entity_type: EntityType; n: number }>>(`
      SELECT e.entity_type, COUNT(DISTINCT e.id)::int AS n
      FROM entities e
      JOIN knowledge_entities ke ON ke.entity_id = e.id
      JOIN knowledge_records kr ON kr.id = ke.knowledge_record_id AND kr.status = 'VERIFIED'
      GROUP BY e.entity_type`);
    res.json(rows.filter((r) => r.n > 0).map((r) => ({ type: r.entity_type, label: SHELF_LABELS[r.entity_type], count: r.n })));
  } catch (err) {
    next(err);
  }
});

/** Search entities + records. Logs an aggregate affinity signal (never the query text). */
router.get("/search", async (req: AuthRequest, res, next) => {
  try {
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    const entities = await prisma.entity.findMany({
      where: {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }],
        knowledgeLinks: { some: { knowledgeRecord: { status: "VERIFIED" } } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        entityType: true,
        _count: { select: { knowledgeLinks: { where: { knowledgeRecord: { status: "VERIFIED" } } } } },
      },
      take: 20,
    });
    const records = await prisma.knowledgeRecord.findMany({
      where: {
        status: "VERIFIED",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
          { placeText: { contains: q, mode: "insensitive" } },
        ],
      },
      include: publicRecordInclude,
      orderBy: { sourceRank: "desc" },
      take: 20,
    });
    if (req.user && entities.length) {
      track(bumpEntities(req.user.id, entities.slice(0, 5).map((e) => e.id), SIGNAL_WEIGHTS.search));
    }
    res.json({
      entities: entities.map((e) => ({ id: e.id, name: e.name, slug: e.slug, type: e.entityType, recordCount: e._count.knowledgeLinks })),
      records: await withViewer(records, req.user?.id),
    });
  } catch (err) {
    next(err);
  }
});

/** Full shelf for one type. */
router.get("/types/:type", async (req: AuthRequest, res, next) => {
  try {
    const type = z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]).parse(String(req.params.type).toUpperCase());
    const data = await buildExplore({ userId: req.user?.id, perShelf: 40 });
    const shelf = data.shelves.find((s) => s.type === type);
    if (!shelf) return res.status(404).json({ error: "Nothing indexed here yet" });
    res.json(shelf);
  } catch (err) {
    next(err);
  }
});

/** Entity page: verified records linked to it, plus related entities. 404 when nothing verified. */
router.get("/entities/:type/:slug", async (req: AuthRequest, res, next) => {
  try {
    const type = z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]).parse(String(req.params.type).toUpperCase());
    const entity = await prisma.entity.findUnique({
      where: { entityType_slug: { entityType: type, slug: String(req.params.slug) } },
    });
    if (!entity) return res.status(404).json({ error: "Not found" });
    const records = await prisma.knowledgeRecord.findMany({
      where: { status: "VERIFIED", entities: { some: { entityId: entity.id } } },
      include: publicRecordInclude,
      orderBy: [{ sourceRank: "desc" }, { verifiedAt: "desc" }],
      take: 100,
    });
    if (records.length === 0) return res.status(404).json({ error: "Not found" });

    const related = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; slug: string; entity_type: EntityType; shared: number }>>(
      `SELECT e.id, e.name, e.slug, e.entity_type, COUNT(*)::int AS shared
       FROM knowledge_entities a
       JOIN knowledge_records kr ON kr.id = a.knowledge_record_id AND kr.status = 'VERIFIED'
       JOIN knowledge_entities b ON b.knowledge_record_id = a.knowledge_record_id AND b.entity_id <> a.entity_id
       JOIN entities e ON e.id = b.entity_id
       WHERE a.entity_id = $1
       GROUP BY e.id ORDER BY shared DESC LIMIT 12`,
      entity.id
    );
    if (req.user) track(bumpEntities(req.user.id, [entity.id], SIGNAL_WEIGHTS.search));
    res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        type: entity.entityType,
        label: SHELF_LABELS[entity.entityType],
        description: entity.description,
        aliases: entity.aliases,
      },
      records: await withViewer(records, req.user?.id),
      related: related.map((r) => ({ id: r.id, name: r.name, slug: r.slug, type: r.entity_type, shared: r.shared })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
