import { Prisma } from "@prisma/client";

/**
 * Public-safe include for records: no emails, no storage paths, and no verifier identity
 * (who verified a record is moderator-only; the Workstation loads it with its own include).
 */
export const publicRecordInclude = {
  createdBy: { select: { id: true, username: true, name: true, reputation: true } },
  citations: {
    select: {
      id: true,
      page: true,
      paragraph: true,
      document: { select: { id: true, filename: true, mimeType: true, size: true } },
    },
  },
  entities: {
    select: {
      source: true,
      entity: { select: { id: true, name: true, slug: true, entityType: true } },
    },
  },
  _count: { select: { corrections: { where: { status: "PENDING" } }, saves: true } },
} satisfies Prisma.KnowledgeRecordInclude;

export type PublicRecord = Prisma.KnowledgeRecordGetPayload<{ include: typeof publicRecordInclude }>;

export function shapeRecord(r: PublicRecord, extra?: { myVote?: string | null; saved?: boolean }) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type,
    status: r.status,
    placeText: r.placeText,
    reviewNote: r.reviewNote,
    upvotes: r.upvotes,
    downvotes: r.downvotes,
    sourceRank: r.sourceRank,
    createdAt: r.createdAt,
    verifiedAt: r.verifiedAt,
    createdBy: r.createdBy,
    /** Never exposed publicly (security): verifier stays in the DB and the Workstation only. */
    verifiedBy: null,
    citations: r.citations,
    entities: r.entities.map((e) => ({ ...e.entity, source: e.source })),
    pendingCorrections: r._count.corrections,
    saves: r._count.saves,
    myVote: extra?.myVote ?? null,
    saved: extra?.saved ?? false,
  };
}
