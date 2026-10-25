import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, optionalAuth, AuthRequest, isStaff } from "../middleware/auth.js";
import { makeObjectName, saveFile, getFileStream } from "../services/storage.js";
import { detectDocument, extractDocumentText, splitIntoRecords } from "../services/text.js";
import { KNOWLEDGE_TYPES } from "./knowledge.js";

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

const bodySchema = z.object({
  type: z.enum(KNOWLEDGE_TYPES).default("history"),
  placeText: z.string().trim().max(200).optional(),
});

/**
 * Upload → validate by magic bytes → extract → split into PENDING draft records.
 * No AI call and no embedding here: records are embedded when verified.
 */
router.post("/", requireAuth, upload.single("file"), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const body = bodySchema.parse(req.body);
    const { originalname, size, buffer } = req.file;
    const { kind, mime } = detectDocument(originalname, buffer);

    const raw = await extractDocumentText(kind, buffer);
    const drafts = splitIntoRecords(raw);
    if (drafts.length === 0) {
      return res.status(400).json({ error: "No readable text found. Scanned PDFs need OCR before upload." });
    }

    const objectName = makeObjectName("documents", originalname);
    await saveFile(objectName, buffer);

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          filename: originalname.slice(0, 200),
          path: objectName,
          mimeType: mime,
          size,
          placeText: body.placeText || null,
          uploadedById: req.user!.id,
        },
      });
      const records = [];
      for (const [i, d] of drafts.entries()) {
        const record = await tx.knowledgeRecord.create({
          data: {
            title: d.title,
            content: d.content,
            type: body.type,
            placeText: body.placeText || null,
            status: "PENDING",
            createdById: req.user!.id,
            citations: { create: { documentId: document.id, paragraph: `Part ${i + 1} of ${drafts.length}` } },
          },
          select: { id: true, title: true, status: true },
        });
        records.push(record);
      }
      return { document, records };
    });

    res.status(201).json({
      document: {
        id: result.document.id,
        filename: result.document.filename,
        mimeType: result.document.mimeType,
        size: result.document.size,
      },
      recordsCreated: result.records.length,
      records: result.records,
      message: `Created ${result.records.length} draft record(s). They will appear publicly once a moderator verifies them.`,
    });
  } catch (err) {
    next(err);
  }
});

/** Your uploads. */
router.get("/", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const docs = await prisma.document.findMany({
      where: { uploadedById: req.user!.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        placeText: true,
        createdAt: true,
        _count: { select: { citations: true } },
      },
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

/**
 * Download the original file. Public only when the document backs at least one
 * VERIFIED record; otherwise uploader or staff.
 */
router.get("/:id/download", optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      include: { _count: { select: { citations: { where: { knowledgeRecord: { status: "VERIFIED" } } } } } },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const allowed = doc._count.citations > 0 || isStaff(req.user) || req.user?.id === doc.uploadedById;
    if (!allowed) return res.status(404).json({ error: "Document not found" });
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/[^\w.\- ]/g, "_")}"`);
    const stream = getFileStream(doc.path);
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).json({ error: "File missing from storage" });
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
