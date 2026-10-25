/**
 * Explore: dynamic shelves built from the verified knowledge base.
 * Pure DB aggregates + an explainable scoring function. NO AI calls.
 *
 *   score = 0.4·affinity + 0.3·quality + 0.2·recency + 0.1·diversity
 */
import crypto from "crypto";
import { EntityType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { ENTITY_TYPES, SHELF_LABELS } from "./entities.js";
import { getAffinityMap } from "./affinity.js";

export interface ShelfEntity {
  id: string;
  name: string;
  slug: string;
  type: EntityType;
  description: string | null;
  recordCount: number;
  sourcedCount: number;
  lastVerifiedAt: string | null;
  score: number;
  reason?: string;
}

interface Row {
  id: string;
  name: string;
  slug: string;
  entity_type: EntityType;
  description: string | null;
  record_count: number;
  sourced_count: number;
  last_verified: Date | null;
}

/** Entities that have ≥1 link to a VERIFIED record. Empty shelves never appear. */
export async function loadIndexedEntities(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    SELECT e.id, e.name, e.slug, e.entity_type, e.description,
           COUNT(DISTINCT kr.id)::int AS record_count,
           COUNT(DISTINCT kr.id) FILTER (WHERE EXISTS (SELECT 1 FROM citations c WHERE c.knowledge_record_id = kr.id))::int AS sourced_count,
           MAX(kr.verified_at) AS last_verified
    FROM entities e
    JOIN knowledge_entities ke ON ke.entity_id = e.id
    JOIN knowledge_records kr ON kr.id = ke.knowledge_record_id AND kr.status = 'VERIFIED'
    GROUP BY e.id
    ORDER BY record_count DESC
    LIMIT 3000
  `);
}

/** Deterministic per-viewer, per-day jitter in [0,1) so identical profiles still see different front rows. */
function jitter(seed: string, id: string) {
  const h = crypto.createHash("md5").update(`${seed}:${id}`).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

export async function buildExplore(opts: { userId?: string; seed?: string; perShelf?: number }) {
  const perShelf = Math.min(opts.perShelf || 12, 40);
  const rows = await loadIndexedEntities();
  const affinity = opts.userId ? await getAffinityMap(opts.userId) : new Map<string, number>();
  const personalized = [...affinity.values()].some((w) => w > 0.5);
  const day = new Date().toISOString().slice(0, 10);
  const seed = `${opts.userId || opts.seed || "anon"}:${day}`;

  const maxCount = Math.max(1, ...rows.map((r) => r.record_count));
  const maxAff = Math.max(1, ...[...affinity.values()]);

  // How much the viewer already engages with each type (for diversity).
  const typeAffinity = new Map<EntityType, number>();
  for (const r of rows) {
    const a = Math.max(0, affinity.get(r.id) || 0);
    typeAffinity.set(r.entity_type, (typeAffinity.get(r.entity_type) || 0) + a);
  }

  const scored: ShelfEntity[] = rows.map((r) => {
    const aff = Math.max(0, affinity.get(r.id) || 0) / maxAff;
    const quality =
      0.7 * (Math.log1p(r.record_count) / Math.log1p(maxCount)) +
      0.3 * (r.record_count ? r.sourced_count / r.record_count : 0);
    const days = r.last_verified ? (Date.now() - new Date(r.last_verified).getTime()) / 86_400_000 : 365;
    const recency = Math.exp(-days / 30);
    const untouchedType = (typeAffinity.get(r.entity_type) || 0) === 0 ? 1 : 0;
    const diversity = personalized ? 0.5 * untouchedType + 0.5 * jitter(seed, r.id) : jitter(seed, r.id);
    const score = 0.4 * aff + 0.3 * quality + 0.2 * recency + 0.1 * diversity;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.entity_type,
      description: r.description,
      recordCount: r.record_count,
      sourcedCount: r.sourced_count,
      lastVerifiedAt: r.last_verified ? new Date(r.last_verified).toISOString() : null,
      score: Math.round(score * 1000) / 1000,
      reason: aff > 0.2 ? "Because of your searches, votes and chats" : recency > 0.6 ? "Recently verified" : undefined,
    };
  });

  const shelves = ENTITY_TYPES.map((type) => {
    const items = scored.filter((e) => e.type === type).sort((a, b) => b.score - a.score);
    const shelfAffinity = typeAffinity.get(type) || 0;
    return {
      type,
      label: SHELF_LABELS[type],
      total: items.length,
      shelfScore: shelfAffinity * 2 + items.slice(0, 5).reduce((s, e) => s + e.score, 0) + jitter(seed, type) * 0.2,
      entities: items.slice(0, perShelf),
    };
  })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.shelfScore - a.shelfScore);

  const forYou = personalized
    ? scored
        .filter((e) => (affinity.get(e.id) || 0) > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    : [];

  // Documents shelf: source files cited by verified records (no file paths).
  const documents = await prisma.document.findMany({
    where: { citations: { some: { knowledgeRecord: { status: "VERIFIED" } } } },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      createdAt: true,
      _count: { select: { citations: { where: { knowledgeRecord: { status: "VERIFIED" } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: perShelf,
  });

  const recent = await prisma.knowledgeRecord.findMany({
    where: { status: "VERIFIED" },
    orderBy: { verifiedAt: "desc" },
    take: 8,
    select: { id: true, title: true, type: true, placeText: true, verifiedAt: true, upvotes: true, downvotes: true },
  });

  return {
    personalized,
    rankingNote: personalized
      ? "Ranked for you from your searches, votes and chats."
      : opts.userId
        ? "Showing what the verified knowledge base contains. Search, vote and ask questions and this page adapts to you."
        : "Showing what the verified knowledge base contains. Sign in and explore to personalise.",
    forYou,
    shelves: shelves.map(({ shelfScore, ...s }) => s),
    documents: documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      mimeType: d.mimeType,
      createdAt: d.createdAt,
      verifiedRecords: d._count.citations,
    })),
    recent,
  };
}
