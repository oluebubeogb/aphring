/**
 * Entity index for Explore. Everything here is rule-based (no AI calls).
 */
import { EntityType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export const ENTITY_TYPES: EntityType[] = ["PERSON", "PLACE", "INSTITUTION", "ORGANIZATION", "EVENT", "TOPIC"];

export const SHELF_LABELS: Record<EntityType | "DOCUMENT", string> = {
  PERSON: "Public figures",
  PLACE: "Places",
  INSTITUTION: "Schools & institutions",
  ORGANIZATION: "Organizations",
  EVENT: "Events",
  TOPIC: "Topics",
  DOCUMENT: "Documents",
};

/** KnowledgeType → TOPIC entity name. Every verified record joins one topic shelf. */
export const TOPIC_FOR_TYPE: Record<string, string> = {
  history: "History",
  politics: "Politics",
  traditional: "Traditional institutions",
  education: "Education",
  culture: "Culture & heritage",
  government: "Government",
  person: "People & biographies",
  event: "Events & occasions",
};

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function cleanEntityName(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s,.;:'"-]+|[\s,.;:'"-]+$/g, "").trim().slice(0, 120);
}

export interface EntitySuggestion {
  name: string;
  type: EntityType;
  reason: string;
  existingId?: string;
}

const CAP = "[A-Z][a-zA-Z'’\\-]+";
const CAPS = `${CAP}(?:\\s+(?:${CAP}|of|and|the))*?\\s*${CAP}`;
const HONORIFIC =
  "(?:Rt\\.?\\s*Hon\\.?|Hon\\.?|Chief|Dr\\.?|Prof\\.?|Sen\\.?|Senator|Governor|Gov\\.?|Mrs\\.?|Mr\\.?|Ms\\.?|Engr\\.?|Barr\\.?|Sir|Lolo|Eze|Igwe|HRH|HRM|Pastor|Rev\\.?|Bishop|Alhaji|Justice|Gen\\.?|Col\\.?)";

const PATTERNS: { type: EntityType; re: RegExp; reason: string; keepWhole?: boolean }[] = [
  {
    type: "PERSON",
    re: new RegExp(`\\b${HONORIFIC}\\s+((?:${CAP}\\s*){1,4})`, "g"),
    reason: "Honorific followed by a name",
  },
  {
    type: "INSTITUTION",
    re: new RegExp(
      `\\b((?:${CAP}\\s+){0,5}(?:School|College|University|Polytechnic|Academy|Seminary|Institute|Hospital|Grammar School|Secondary School|Primary School))(?:,?\\s+(${CAP}))?`,
      "g"
    ),
    reason: "Name ending in School/College/University…",
    keepWhole: true,
  },
  {
    type: "ORGANIZATION",
    re: new RegExp(
      `\\b((?:${CAP}\\s+){1,5}(?:Party|Union|Association|Council|Commission|Ministry|Assembly|Congress|Foundation|Cooperative|Society|Agency|Board))\\b`,
      "g"
    ),
    reason: "Name ending in Party/Council/Ministry…",
    keepWhole: true,
  },
  {
    type: "EVENT",
    re: new RegExp(
      `\\b((?:${CAP}\\s+){1,4}(?:Festival|War|Crisis|Ceremony|Uprising|Riot|Conference|Day))\\b|\\b((?:19|20)\\d{2}\\s+(?:${CAP}\\s+){0,3}(?:election|elections|Election|Elections))`,
      "g"
    ),
    reason: "Festival/War/Election pattern",
    keepWhole: true,
  },
];

const STOP_LEADING = /^(The|A|An|In|On|At|Of|And|By|For|From|With|This|That|Our)\s+/;

/** Rule-based entity suggestions for a record. Used by the workstation review pane. */
export async function suggestEntities(input: {
  title: string;
  content: string;
  type: string;
  placeText?: string | null;
}): Promise<EntitySuggestion[]> {
  const text = `${input.title}\n${input.content}`;
  const out = new Map<string, EntitySuggestion>();
  const add = (s: EntitySuggestion) => {
    const name = cleanEntityName(s.name).replace(STOP_LEADING, "");
    if (name.length < 3 || name.split(" ").length > 8) return;
    const key = `${s.type}:${slugify(name)}`;
    if (!out.has(key)) out.set(key, { ...s, name });
  };

  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const raw = p.type === "PERSON" ? m[1] : m[0];
      if (raw) add({ name: raw, type: p.type, reason: p.reason });
    }
  }

  // Free-text place from the contributor.
  if (input.placeText?.trim()) {
    add({ name: input.placeText.trim(), type: "PLACE", reason: "Contributor's place" });
  }

  // Known entities (catalog places + previously confirmed entities) mentioned in the text.
  const known = await prisma.entity.findMany({
    select: { id: true, name: true, entityType: true, aliases: true },
    take: 5000,
  });
  const lower = text.toLowerCase();
  for (const e of known) {
    for (const n of [e.name, ...e.aliases]) {
      if (n.length < 3) continue;
      const re = new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(lower)) {
        add({ name: e.name, type: e.entityType, reason: "Mentions a known entity", existingId: e.id });
        break;
      }
    }
  }

  // Attach existing ids where the suggestion already exists.
  const result = [...out.values()];
  for (const s of result) {
    if (s.existingId) continue;
    const hit = known.find(
      (e) =>
        e.entityType === s.type &&
        (slugify(e.name) === slugify(s.name) || e.aliases.some((a) => slugify(a) === slugify(s.name)))
    );
    if (hit) {
      s.existingId = hit.id;
      s.name = hit.name;
    }
  }
  const seen = new Set<string>();
  return result
    .filter((s) => {
      const k = s.existingId || `${s.type}:${slugify(s.name)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 30);
}

/** Find an entity by type + slug or alias, or create it. */
export async function upsertEntity(
  tx: Prisma.TransactionClient,
  name: string,
  type: EntityType
) {
  const clean = cleanEntityName(name);
  const slug = slugify(clean);
  if (!slug) return null;
  const exact = await tx.entity.findUnique({ where: { entityType_slug: { entityType: type, slug } } });
  if (exact) return exact;
  // Alias match, compared by slug so "item, bende" finds the catalog alias "Item, Bende".
  const withAliases = await tx.entity.findMany({
    where: { entityType: type, NOT: { aliases: { isEmpty: true } } },
    select: { id: true, aliases: true },
  });
  const hit = withAliases.find((e) => e.aliases.some((a) => slugify(a) === slug));
  if (hit) return tx.entity.findUniqueOrThrow({ where: { id: hit.id } });
  return tx.entity.create({ data: { name: clean, slug, entityType: type } });
}

export async function linkEntity(
  tx: Prisma.TransactionClient,
  recordId: string,
  entityId: string,
  source: string
) {
  await tx.knowledgeEntity.upsert({
    where: { knowledgeRecordId_entityId: { knowledgeRecordId: recordId, entityId } },
    update: {},
    create: { knowledgeRecordId: recordId, entityId, source },
  });
}

/** Merge `sourceId` into `targetId`: moves links + affinities, keeps the name as an alias. */
export async function mergeEntities(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  await prisma.$transaction(async (tx) => {
    const [src, dst] = await Promise.all([
      tx.entity.findUniqueOrThrow({ where: { id: sourceId } }),
      tx.entity.findUniqueOrThrow({ where: { id: targetId } }),
    ]);
    const links = await tx.knowledgeEntity.findMany({ where: { entityId: sourceId } });
    for (const l of links) await linkEntity(tx, l.knowledgeRecordId, targetId, l.source);
    const affs = await tx.userAffinity.findMany({ where: { entityId: sourceId } });
    for (const a of affs) {
      await tx.userAffinity.upsert({
        where: { userId_entityId: { userId: a.userId, entityId: targetId } },
        update: { weight: { increment: a.weight } },
        create: { userId: a.userId, entityId: targetId, weight: a.weight },
      });
    }
    const aliases = Array.from(new Set([...dst.aliases, ...src.aliases, src.name])).filter((a) => a !== dst.name);
    await tx.entity.update({ where: { id: targetId }, data: { aliases, isCatalog: dst.isCatalog && src.isCatalog } });
    await tx.entity.delete({ where: { id: sourceId } });
  });
}
