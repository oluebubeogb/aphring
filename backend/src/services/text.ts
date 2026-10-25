import pdf from "pdf-parse";
import mammoth from "mammoth";
import { HttpError } from "../middleware/error.js";

export type DocKind = "pdf" | "docx" | "txt";

/**
 * Identify a document by extension AND magic bytes. The client-supplied MIME
 * type is ignored.
 */
export function detectDocument(originalName: string, buf: Buffer): { kind: DocKind; mime: string } {
  const ext = originalName.toLowerCase().split(".").pop() || "";
  const head = buf.subarray(0, 8);
  const isPdf = head.subarray(0, 5).toString("latin1") === "%PDF-";
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const isOle = head.toString("hex").startsWith("d0cf11e0a1b11ae1");

  if (ext === "doc" || isOle) {
    throw new HttpError(400, "Legacy Word .doc files are not supported. Please save as .docx or PDF and upload again.");
  }
  if (ext === "pdf" && isPdf) return { kind: "pdf", mime: "application/pdf" };
  if (ext === "docx" && isZip) {
    return { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (ext === "txt") {
    if (buf.includes(0)) throw new HttpError(400, "This .txt file contains binary data.");
    return { kind: "txt", mime: "text/plain" };
  }
  throw new HttpError(400, "Unsupported or mismatched file. Upload a real PDF, DOCX or TXT file.");
}

export async function extractDocumentText(kind: DocKind, buf: Buffer): Promise<string> {
  if (kind === "pdf") return (await pdf(buf)).text;
  if (kind === "docx") return (await mammoth.extractRawText({ buffer: buf })).value;
  return buf.toString("utf-8");
}

/** Loose magic-byte check for audio uploads. */
export function looksLikeAudio(buf: Buffer): boolean {
  const h = buf.subarray(0, 12);
  const ascii = h.toString("latin1");
  return (
    ascii.startsWith("ID3") || // mp3 w/ tag
    (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) || // mp3/aac frame
    ascii.startsWith("RIFF") || // wav
    ascii.startsWith("OggS") ||
    ascii.startsWith("fLaC") ||
    h.toString("hex").startsWith("1a45dfa3") || // webm/mkv
    ascii.slice(4, 8) === "ftyp" // m4a/mp4
  );
}

/**
 * Normalise extracted text WITHOUT destroying paragraph breaks
 * (the original cleanText collapsed all whitespace, so splitting never worked).
 */
export function normalizeDocumentText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collapse to a single line — for titles, retrieval snippets, etc. */
export function singleLine(s: string): string {
  return s.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

const MAX_RECORDS_PER_UPLOAD = 25;
const TARGET_CHARS = 1200;

/**
 * Split text into draft records. Uses blank-line paragraphs; very short
 * paragraphs are merged and very long ones are split on sentence boundaries.
 * Rule-based — no AI call.
 */
export function splitIntoRecords(raw: string): { title: string; content: string }[] {
  const text = normalizeDocumentText(raw);
  let paragraphs = text.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);

  // PDFs often have no blank lines: fall back to single newlines ending a sentence.
  if (paragraphs.length <= 1 && text.length > TARGET_CHARS * 1.5) {
    paragraphs = text.split(/(?<=[.!?])\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  }

  const chunks: string[] = [];
  let buf = "";
  const push = () => {
    if (buf.trim().length >= 80) chunks.push(buf.trim());
    buf = "";
  };
  for (const p of paragraphs) {
    if (p.length > TARGET_CHARS * 1.6) {
      push();
      const sentences = p.match(/[^.!?]+[.!?]+["')\]]?\s*|[^.!?]+$/g) || [p];
      for (const s of sentences) {
        if ((buf + s).length > TARGET_CHARS) push();
        buf += s;
      }
      push();
      continue;
    }
    if ((buf + " " + p).length > TARGET_CHARS) push();
    buf = buf ? `${buf}\n\n${p}` : p;
    if (buf.length >= 160) push();
  }
  push();

  return chunks.slice(0, MAX_RECORDS_PER_UPLOAD).map((c, i) => {
    const first = singleLine(c).split(/(?<=[.!?])\s/)[0] || "";
    return {
      title: (first.length > 120 ? first.slice(0, 117) + "…" : first) || `Extract ${i + 1}`,
      content: c.slice(0, 4000),
    };
  });
}
