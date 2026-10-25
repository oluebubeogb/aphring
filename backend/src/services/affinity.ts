/**
 * Personalisation signals. Only aggregated per-entity weights are stored —
 * never raw search queries or chat text.
 */
import { prisma } from "./prisma.js";

export const SIGNAL_WEIGHTS = {
  search: 1,
  chatSource: 1,
  voteUp: 2,
  voteDown: -1,
  save: 2,
} as const;

const HALF_LIFE_DAYS = 30;
const MIN_WEIGHT = -5;
const MAX_WEIGHT = 50;

export async function bumpEntities(userId: string, entityIds: string[], delta: number) {
  const unique = [...new Set(entityIds)].slice(0, 20);
  for (const entityId of unique) {
    const cur = await prisma.userAffinity.findUnique({ where: { userId_entityId: { userId, entityId } } });
    const decayed = cur ? decay(cur.weight, cur.updatedAt) : 0;
    const weight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, decayed + delta));
    await prisma.userAffinity.upsert({
      where: { userId_entityId: { userId, entityId } },
      update: { weight },
      create: { userId, entityId, weight },
    });
  }
}

export async function bumpFromRecords(userId: string, recordIds: string[], delta: number) {
  if (!recordIds.length) return;
  const links = await prisma.knowledgeEntity.findMany({
    where: { knowledgeRecordId: { in: recordIds } },
    select: { entityId: true },
  });
  await bumpEntities(userId, links.map((l) => l.entityId), delta);
}

export function decay(weight: number, updatedAt: Date) {
  const days = (Date.now() - updatedAt.getTime()) / 86_400_000;
  return weight * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/** entityId → decayed weight */
export async function getAffinityMap(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.userAffinity.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.entityId, decay(r.weight, r.updatedAt)]));
}

/** Fire-and-forget wrapper so signals never break a request. */
export function track(p: Promise<unknown>) {
  p.catch((err) => console.warn("[affinity] signal failed:", err?.message));
}
