import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { makeObjectName, saveFile } from "../services/storage.js";
import { looksLikeAudio, splitIntoRecords } from "../services/text.js";
import { KNOWLEDGE_TYPES } from "./knowledge.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // Whisper's limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/webm" || file.mimetype === "video/mp4") cb(null, true);
    else cb(new HttpError(400, "Only audio files are allowed"));
  },
});

const bodySchema = z.object({
  type: z.enum(KNOWLEDGE_TYPES).default("history"),
  placeText: z.string().trim().max(200).optional(),
  transcript: z.string().max(50000).optional(),
});

router.use(requireAuth);

/**
 * Oral history: upload audio → optional Whisper transcript → rule-based split into
 * PENDING draft records. No LLM fact-extraction and no embedding at submit time.
 */
router.post("/", upload.single("audio"), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file" });
    const body = bodySchema.parse(req.body);
    const { originalname, mimetype, size, buffer } = req.file;
    if (!looksLikeAudio(buffer)) return res.status(400).json({ error: "File does not look like audio" });

    const objectName = makeObjectName("audio", originalname);
    await saveFile(objectName, buffer);

    let transcript = body.transcript?.trim() || "";
    let sttNote: string | null = null;
    if (!transcript && process.env.OPENAI_API_KEY) {
      try {
        transcript = await transcribeWithWhisper(buffer, originalname, mimetype);
      } catch (e) {
        sttNote = "Transcription failed; audio saved without transcript.";
        console.warn("STT failed:", (e as Error).message);
      }
    }

    const drafts = transcript.length > 50 ? splitIntoRecords(transcript) : [];
    const result = await prisma.$transaction(async (tx) => {
      const audio = await tx.audioUpload.create({
        data: {
          filename: originalname.slice(0, 200),
          path: objectName,
          mimeType: mimetype,
          size,
          transcript: transcript || null,
          status: drafts.length ? "EXTRACTED" : transcript ? "TRANSCRIBED" : "PENDING",
          placeText: body.placeText || null,
          uploadedById: req.user!.id,
        },
      });
      const records = [];
      for (const d of drafts) {
        records.push(
          await tx.knowledgeRecord.create({
            data: {
              title: d.title,
              content: d.content,
              type: body.type,
              placeText: body.placeText || null,
              status: "PENDING",
              createdById: req.user!.id,
            },
            select: { id: true, title: true, status: true },
          })
        );
      }
      return { audio, records };
    });

    res.status(201).json({
      audio: { id: result.audio.id, filename: result.audio.filename, status: result.audio.status },
      extracted: result.records.length,
      records: result.records,
      message: transcript
        ? `Created ${result.records.length} draft record(s) for moderator review.`
        : sttNote || "Audio saved. Paste a transcript, or configure OPENAI_API_KEY for automatic transcription.",
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
      select: { id: true, filename: true, status: true, placeText: true, createdAt: true, size: true },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

async function transcribeWithWhisper(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("model", "whisper-1");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as { text?: string };
  return data.text ?? "";
}

export default router;
