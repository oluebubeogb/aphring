import { Router } from "express";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";
import { createEmbedding, embeddingToSql } from "../services/embeddings.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { status, type, community, q, page = "1", limit = "20" } = req.query;
    const take = Math.min(parseInt(limit as string, 10) || 20, 50);
    const skip = (Math.max(parseInt(page as string, 10) || 1, 1) - 1) * take;

    const where: any = {};
    if (status) where.status = status;
    else where.status = "VERIFIED"; // public default
    if (type) where.type = type;
    if (community) where.communityId = community;
    if (q) {
      where.OR = [
        { title: { contains: q as string, mode: "insensitive" } },
        { content: { contains: q as string, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.knowledgeRecord.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          community: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.knowledgeRecord.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), limit: take });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const record = await prisma.knowledgeRecord.findUnique({
      where: { id: req.params.id },
      include: {
        community: true,
        createdBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        citations: { include: { document: true } },
        entities: { include: { entity: true } },
      },
    });
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  title: z.string().min(3).max(300),
  content: z.string().min(10),
  type: z.enum([
    "history",
    "politics",
    "traditional",
    "education",
    "culture",
    "government",
    "person",
    "event",
  ]),
  communityId: z.string().optional(),
});

router.post("/", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const embedding = await createEmbedding(`${body.title}\n${body.content}`);

    // Insert with raw for vector
    const record = await prisma.knowledgeRecord.create({
      data: {
        title: body.title,
        content: body.content,
        type: body.type,
        status: "PENDING",
        createdById: req.user!.id,
        communityId: body.communityId,
      },
    });

    // Set embedding via raw
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_records SET embedding = $1::vector WHERE id = $2`,
      embeddingToSql(embedding),
      record.id
    );

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("MODERATOR", "ADMIN"),
  async (req: AuthRequest, res, next) => {
    try {
      const { status } = z
        .object({ status: z.enum(["VERIFIED", "REJECTED", "PENDING"]) })
        .parse(req.body);

      const record = await prisma.knowledgeRecord.update({
        where: { id: req.params.id },
        data: {
          status,
          verifiedById: status === "VERIFIED" ? req.user!.id : null,
        },
      });
      res.json(record);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
