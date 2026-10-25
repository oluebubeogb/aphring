import { EntityType, KnowledgeType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { upsertEntity, linkEntity, TOPIC_FOR_TYPE } from "./entities.js";
import { embedRecords } from "./embeddings.js";
import { audit } from "./roles.js";
import { HttpError } from "../middleware/error.js";

export const VERIFY_REPUTATION = 5;

export interface ReviewInput {
  recordId: string;
  reviewerId: string;
  decision: "VERIFY" | "REJECT" | "PENDING";
  note?: string;
  title?: string;
  content?: string;
  type?: KnowledgeType;
  /** Normalised place name. `null` clears it. Omitted keeps contributor's free text. */
  place?: string | null;
  entities?: { name: string; type: EntityType }[];
}

export async function recomputeSourceRank(tx: Prisma.TransactionClient, recordId: string) {
  const r = await tx.knowledgeRecord.findUnique({
    where: { id: recordId },
    select: { upvotes: true, downvotes: true, status: true, _count: { select: { citations: true } } },
  });
  if (!r) return;
  const rank = r.upvotes - r.downvotes + (r.status === "VERIFIED" ? 10 : 0) + (r._count.citations > 0 ? 2 : 0);
  await tx.knowledgeRecord.update({ where: { id: recordId }, data: { sourceRank: rank } });
}

export async function reviewRecord(input: ReviewInput) {
  const status = input.decision === "VERIFY" ? "VERIFIED" : input.decision === "REJECT" ? "REJECTED" : "PENDING";
  if (status === "REJECTED" && !input.note?.trim()) {
    throw new HttpError(400, "A reason is required when rejecting");
  }

  const record = await prisma.$transaction(async (tx) => {
    const cur = await tx.knowledgeRecord.findUnique({ where: { id: input.recordId } });
    if (!cur) throw new HttpError(404, "Record not found");

    const title = input.title?.trim() || cur.title;
    const content = input.content?.trim() || cur.content;
    if (title !== cur.title || content !== cur.content) {
      await tx.recordRevision.create({
        data: {
          knowledgeRecordId: cur.id,
          title: cur.title,
          content: cur.content,
          editedById: input.reviewerId,
          reason: "Edited during review",
        },
      });
    }

    const wasVerified = cur.status === "VERIFIED";
    const nowVerified = status === "VERIFIED";
    if (wasVerified !== nowVerified) {
      await tx.user.update({
        where: { id: cur.createdById },
        data: { reputation: { increment: nowVerified ? VERIFY_REPUTATION : -VERIFY_REPUTATION } },
      });
    }

    const placeText = input.place === undefined ? cur.placeText : input.place?.trim() || null;
    const type = input.type || cur.type;

    const updated = await tx.knowledgeRecord.update({
      where: { id: cur.id },
      data: {
        title,
        content,
        type,
        placeText,
        status,
        reviewNote: input.note?.trim() || null,
        verifiedById: nowVerified ? input.reviewerId : null,
        verifiedAt: nowVerified ? cur.verifiedAt && wasVerified ? cur.verifiedAt : new Date() : null,
      },
    });

    if (nowVerified) {
      // Rebuild the entity links from the moderator's confirmed set.
      const keep = new Set<string>();
      const topicName = TOPIC_FOR_TYPE[type];
      if (topicName) {
        const t = await upsertEntity(tx, topicName, "TOPIC");
        if (t) {
          await linkEntity(tx, cur.id, t.id, "TOPIC");
          keep.add(t.id);
        }
      }
      if (placeText) {
        const p = await upsertEntity(tx, placeText, "PLACE");
        if (p) {
          await linkEntity(tx, cur.id, p.id, "PLACE");
          keep.add(p.id);
        }
      }
      if (input.entities) {
        for (const e of input.entities.slice(0, 40)) {
          const ent = await upsertEntity(tx, e.name, e.type);
          if (ent) {
            await linkEntity(tx, cur.id, ent.id, "MODERATOR");
            keep.add(ent.id);
          }
        }
        await tx.knowledgeEntity.deleteMany({ where: { knowledgeRecordId: cur.id, entityId: { notIn: [...keep] } } });
      }
    }

    await recomputeSourceRank(tx, cur.id);
    return updated;
  });

  await audit(input.reviewerId, `record.${status.toLowerCase()}`, record.id, {
    note: input.note || null,
    entities: input.entities?.length ?? null,
  });

  // Embed on verify — never at draft time. Skips if text hash unchanged.
  if (status === "VERIFIED") await embedRecords([record.id]);
  return record;
}
