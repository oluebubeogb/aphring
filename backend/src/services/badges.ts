/**
 * Badges and milestones — derived on read from VERIFIED work only.
 * Nothing is stored, so badges can never drift from the data.
 */
import { prisma } from "./prisma.js";

export interface UserStats {
  verifiedRecords: number;
  verifiedWords: number;
  verifiedFiles: number;
  upvotesReceived: number;
  acceptedCorrections: number;
  reviewsDone: number;
}

const LADDERS: { key: keyof UserStats; label: string; unit: string; steps: number[]; names: string[] }[] = [
  { key: "verifiedRecords", label: "Verified records", unit: "records", steps: [1, 5, 25, 100, 500], names: ["First record", "Contributor", "Chronicler", "Historian", "Archivist of the people"] },
  { key: "verifiedWords", label: "Verified words", unit: "words", steps: [500, 5000, 25000, 100000], names: ["Storyteller", "Wordsmith", "Scribe", "Living library"] },
  { key: "verifiedFiles", label: "Verified files", unit: "files", steps: [1, 5, 25, 100], names: ["First source", "Collector", "Curator", "Keeper of records"] },
  { key: "upvotesReceived", label: "Upvotes received", unit: "upvotes", steps: [10, 100, 1000], names: ["Trusted voice", "Community favourite", "Pillar"] },
  { key: "acceptedCorrections", label: "Accepted corrections", unit: "corrections", steps: [1, 10, 50], names: ["Fact-checker", "Sharp eye", "Guardian of accuracy"] },
];

export async function getUserStats(userId: string): Promise<UserStats> {
  const [agg] = await prisma.$queryRawUnsafe<Array<{ records: number; words: number; ups: number }>>(
    `SELECT COUNT(*)::int AS records,
            COALESCE(SUM(array_length(regexp_split_to_array(trim(content), '\\s+'), 1)), 0)::int AS words,
            COALESCE(SUM(upvotes), 0)::int AS ups
     FROM knowledge_records WHERE created_by = $1 AND status = 'VERIFIED'`,
    userId
  );
  const [files, corrections, reviews] = await Promise.all([
    prisma.document.count({
      where: { uploadedById: userId, citations: { some: { knowledgeRecord: { status: "VERIFIED" } } } },
    }),
    prisma.correction.count({ where: { proposedById: userId, status: "ACCEPTED" } }),
    prisma.knowledgeRecord.count({ where: { verifiedById: userId } }),
  ]);
  return {
    verifiedRecords: agg?.records ?? 0,
    verifiedWords: agg?.words ?? 0,
    verifiedFiles: files,
    upvotesReceived: agg?.ups ?? 0,
    acceptedCorrections: corrections,
    reviewsDone: reviews,
  };
}

/** Public view of stats: drops staff-only signals (review counts would reveal who moderates). */
export function publicStats(stats: UserStats): Omit<UserStats, "reviewsDone"> {
  const { reviewsDone: _hidden, ...rest } = stats;
  return rest;
}

const RECORD_LADDER = LADDERS.find((l) => l.key === "verifiedRecords")!;

/** Role-neutral milestones for the leaderboard (same names as the verified-records badges). */
export const RECORD_MILESTONES = RECORD_LADDER.steps.map((min, i) => ({ min, name: RECORD_LADDER.names[i] }));

export function recordMilestone(records: number): string | null {
  let name: string | null = null;
  for (const m of RECORD_MILESTONES) if (records >= m.min) name = m.name;
  return name;
}

export function deriveBadges(stats: UserStats, role: string) {
  const badges: { id: string; name: string; description: string }[] = [];
  if (role === "ADMIN") badges.push({ id: "role-admin", name: "Admin", description: "Runs Aphring" });
  if (role === "MODERATOR") badges.push({ id: "role-mod", name: "Moderator", description: "Reviews and verifies records" });
  for (const l of LADDERS) {
    l.steps.forEach((s, i) => {
      if (stats[l.key] >= s) badges.push({ id: `${l.key}-${s}`, name: l.names[i], description: `${s.toLocaleString()} ${l.unit}` });
    });
  }
  const milestones = LADDERS.map((l) => {
    const value = stats[l.key];
    const next = l.steps.find((s) => s > value) ?? null;
    const prev = [...l.steps].reverse().find((s) => s <= value) ?? 0;
    return {
      key: l.key,
      label: l.label,
      value,
      next,
      nextBadge: next ? l.names[l.steps.indexOf(next)] : null,
      progress: next ? Math.min(1, (value - prev) / (next - prev)) : 1,
    };
  });
  return { badges, milestones };
}
