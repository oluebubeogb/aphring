import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: [{ state: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { knowledgeRecords: true } },
      },
    });
    res.json(communities);
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    const community = await prisma.community.findUnique({
      where: { slug },
      include: {
        knowledgeRecords: {
          where: { status: "VERIFIED" },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            createdBy: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!community) return res.status(404).json({ error: "Community not found" });
    res.json(community);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  lga: z.string().optional(),
  state: z.string().default("Abia"),
  country: z.string().default("Nigeria"),
  description: z.string().optional(),
});

router.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "MODERATOR"),
  async (req: AuthRequest, res, next) => {
    try {
      const body = createSchema.parse(req.body);
      const community = await prisma.community.create({ data: body });
      res.status(201).json(community);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
