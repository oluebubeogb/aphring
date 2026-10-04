import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import pdf from "pdf-parse";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { uploadFile } from "../services/minio.js";
import { extractFactsFromText } from "../services/ai.js";
import { createEmbedding, embeddingToSql } from "../services/embeddings.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF, TXT, DOC, DOCX allowed"));
  },
});

router.use(requireAuth);

router.post("/", upload.single("file"), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { originalname, mimetype, size, buffer } = req.file;
    const objectName = `documents/${uuid()}-${originalname}`;

    await uploadFile(objectName, buffer, mimetype);

    const doc = await prisma.document.create({
      data: {
        filename: originalname,
        path: objectName,
        mimeType: mimetype,
        size,
        uploadedById: req.user!.id,
      },
    });

    // Extract text
    let text = "";
    if (mimetype === "application/pdf") {
      const data = await pdf(buffer);
      text = data.text;
    } else if (mimetype === "text/plain") {
      text = buffer.toString("utf-8");
    } else {
      // DOCX basic: treat as text for Phase 1 (improve later)
      text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ");
    }

    // Extract draft knowledge records
    const facts = await extractFactsFromText(text, req.user!.id);
    const createdRecords = [];

    for (const fact of facts) {
      const embedding = await createEmbedding(`${fact.title}\n${fact.content}`);
      const record = await prisma.knowledgeRecord.create({
        data: {
          title: fact.title,
          content: fact.content,
          type: fact.type as any,
          status: "PENDING",
          createdById: req.user!.id,
        },
      });

      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_records SET embedding = $1::vector WHERE id = $2`,
        embeddingToSql(embedding),
        record.id
      );

      await prisma.citation.create({
        data: {
          knowledgeRecordId: record.id,
          documentId: doc.id,
        },
      });

      createdRecords.push(record);
    }

    res.status(201).json({
      document: doc,
      extracted: createdRecords.length,
      records: createdRecords,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const docs = await prisma.document.findMany({
      where: { uploadedById: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

export default router;
