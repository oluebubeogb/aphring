import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { uploadFile } from "../services/minio.js";
import { extractFactsFromText } from "../services/ai.js";
import { createEmbedding, embeddingToSql } from "../services/embeddings.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/x-m4a",
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files allowed"));
    }
  },
});

router.use(requireAuth);

/**
 * Phase 2 Oral History flow:
 * 1. Upload audio → storage
 * 2. Transcribe (Whisper API or Runpod STT — placeholder extracts if transcript provided)
 * 3. Fact extraction → PENDING knowledge records
 */
router.post("/", upload.single("audio"), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    const { originalname, mimetype, size, buffer } = req.file;
    const communityId = req.body.communityId as string | undefined;
    let transcript = (req.body.transcript as string) || "";

    const objectName = `audio/${uuid()}-${originalname}`;
    await uploadFile(objectName, buffer, mimetype);

    if (!transcript && process.env.OPENAI_API_KEY) {
      try {
        transcript = await transcribeWithWhisper(buffer, originalname, mimetype);
      } catch (e) {
        console.warn("STT failed, saving without transcript:", e);
      }
    }

    const audio = await prisma.audioUpload.create({
      data: {
        filename: originalname,
        path: objectName,
        mimeType: mimetype,
        size,
        transcript: transcript || null,
        status: transcript ? "TRANSCRIBED" : "PENDING",
        uploadedById: req.user!.id,
        communityId: communityId || null,
      },
    });

    let extracted = 0;
    const records = [];

    if (transcript && transcript.length > 50) {
      const facts = await extractFactsFromText(transcript, req.user!.id);
      for (const fact of facts) {
        const embedding = await createEmbedding(`${fact.title}\n${fact.content}`);
        const record = await prisma.knowledgeRecord.create({
          data: {
            title: fact.title,
            content: fact.content,
            type: (fact.type as any) || "history",
            status: "PENDING",
            createdById: req.user!.id,
            communityId: communityId || null,
          },
        });
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_records SET embedding = $1::vector WHERE id = $2`,
          embeddingToSql(embedding),
          record.id
        );
        records.push(record);
        extracted++;
      }
      await prisma.audioUpload.update({
        where: { id: audio.id },
        data: { status: "EXTRACTED" },
      });
    }

    res.status(201).json({
      audio,
      extracted,
      records,
      message: transcript
        ? `Transcribed and extracted ${extracted} draft records for verification`
        : "Audio saved. Provide transcript or configure OPENAI_API_KEY for STT.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.audioUpload.findMany({
      where: { uploadedById: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

async function transcribeWithWhisper(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  const uint8 = new Uint8Array(buffer);
  const blob = new Blob([uint8], {
    type: mimeType,
  });
  form.append("file", blob, filename);
  form.append("model", "whisper-1");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.text ?? "";
}

export default router;
