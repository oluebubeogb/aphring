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
  /** Short passage from a random VERIFIED record linked to this entity (mentions the name when possible). */
  excerpt: string | null;
  excerptRecordId: string | null;
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
      excerpt: null,
      excerptRecordId: null,
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

  // Tile excerpts: only for entities actually shown (one cheap SQL query, no AI).
  const shown = new Map<string, ShelfEntity>();
  for (const e of [...shelves.flatMap((sh) => sh.entities), ...forYou]) shown.set(e.id, e);
  const excerpts = await loadEntityExcerpts([...shown.values()]);
  for (const e of shown.values()) {
    const x = excerpts.get(e.id);
    if (x) {
      e.excerpt = x.excerpt;
      e.excerptRecordId = x.recordId;
    }
  }

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
    // Ranking still adapts quietly; no personalisation copy is shown to readers.
    rankingNote: "Built from verified records only.",
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

const EXCERPT_MIN = 140;
const EXCERPT_MAX = 220;
const NAME_STOP = new Set(["the", "and", "of", "for", "in", "on", "at", "to", "a", "an", "state", "local", "government", "area"]);

/** Significant lowercase words of an entity name ("Chinua Achebe" → [chinua, achebe]). */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !NAME_STOP.has(w));
}

function escapeRegex(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Clean record text for a one-line tile: drop the "About …" subject line chunks carry, collapse whitespace. */
function tileText(content: string): string {
  return content
    .replace(/^About [^\n]*\n+/, "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Earliest whole-word match of any name token (case-insensitive), or -1. */
function firstMatch(text: string, tokens: string[]): number {
  let best = -1;
  for (const t of tokens) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t)}(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

/**
 * ~140–220 chars around the first mention of the name, snapped to sentence/word edges, "…" where clipped.
 * Falls back to the start of the text when the name isn't mentioned.
 */
export function makeExcerpt(content: string, name: string): { text: string; matched: boolean } {
  const text = tileText(content);
  if (!text) return { text: "", matched: false };
  const at = firstMatch(text, nameTokens(name));
  if (text.length <= EXCERPT_MAX) return { text, matched: at >= 0 };

  let start = 0;
  if (at > 0) {
    // Start at the sentence holding the match when it is close; else ~60 chars before, on a word edge.
    const before = text.slice(0, at);
    const sentence = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
    if (sentence >= 0 && at - sentence <= 120) start = sentence + 2;
    else {
      start = Math.max(0, at - 60);
      const sp = text.indexOf(" ", start);
      if (sp > 0 && sp < at) start = sp + 1;
    }
  }
  let end = Math.min(text.length, start + EXCERPT_MAX);
  if (end < text.length) {
    // Prefer ending on a sentence inside the window, else on a word.
    const win = text.slice(start, end);
    const stop = Math.max(win.lastIndexOf(". "), win.lastIndexOf("! "), win.lastIndexOf("? "));
    if (stop + 1 >= EXCERPT_MIN) end = start + stop + 1;
    else {
      const sp = win.lastIndexOf(" ");
      if (sp >= EXCERPT_MIN - 40) end = start + sp;
    }
  }
  let out = text.slice(start, end).trim().replace(/[,;:\s]+$/, "");
  if (start > 0) out = `…${out}`;
  if (end < text.length && !/[.!?]$/.test(out)) out = `${out}…`;
  return { text: out, matched: at >= 0 };
}

/**
 * For each entity, a few random VERIFIED records linked to it (SQL), then one excerpt —
 * preferring records that actually mention the entity name. Varies on each load; no AI.
 */
async function loadEntityExcerpts(entities: ShelfEntity[]): Promise<Map<string, { excerpt: string; recordId: string }>> {
  const out = new Map<string, { excerpt: string; recordId: string }>();
  if (entities.length === 0) return out;
  const rows = await prisma.$queryRawUnsafe<Array<{ entity_id: string; id: string; content: string }>>(
    `SELECT entity_id, id, content FROM (
       SELECT ke.entity_id, kr.id, left(kr.content, 4000) AS content,
              row_number() OVER (PARTITION BY ke.entity_id ORDER BY random()) AS rn
       FROM knowledge_entities ke
       JOIN knowledge_records kr ON kr.id = ke.knowledge_record_id AND kr.status = 'VERIFIED'
       WHERE ke.entity_id = ANY($1::text[])
     ) x
     WHERE rn <= 4`,
    entities.map((e) => e.id)
  );
  const byEntity = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byEntity.get(r.entity_id) || [];
    list.push(r);
    byEntity.set(r.entity_id, list);
  }
  for (const e of entities) {
    const cands = (byEntity.get(e.id) || [])
      .map((r) => ({ id: r.id, ...makeExcerpt(r.content, e.name) }))
      .filter((c) => c.text);
    if (cands.length === 0) continue;
    // Rows are already in random order: take the first that mentions the name, else the first one.
    const pick = cands.find((c) => c.matched) || cands[0];
    out.set(e.id, { excerpt: pick.text, recordId: pick.id });
  }
  return out;
}
