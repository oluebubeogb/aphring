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

export const MAX_RECORDS_PER_UPLOAD = 25;
const TARGET_CHARS = 1100;
const MAX_CHARS = 1500;
const MIN_CHARS = 450;
const MAX_CONTENT = 4000;

export interface DraftRecord {
  title: string;
  content: string;
}

export interface SplitResult {
  subject: string | null;
  records: DraftRecord[];
}

interface Section {
  heading: string | null;
  paragraphs: string[];
}

const PRONOUN_START =
  /^(he|she|they|it|his|her|hers|their|theirs|its|him|them|this|these|those|that|there|here|such|both|later|then|also|however|meanwhile|afterwards)\b/i;

const NON_SUBJECT_LEAD = new Set([
  "in", "on", "at", "during", "after", "before", "when", "while", "this", "that", "these", "those", "it", "he", "she",
  "they", "we", "i", "a", "an", "as", "by", "for", "from", "with", "of", "to", "if", "since", "although", "though",
  "chapter", "part", "section", "introduction", "abstract", "summary", "contents", "table", "page",
]);

/** Short line with no sentence punctuation → section heading ("Early Life and Education"). */
function isHeading(line: string): boolean {
  const l = line.trim();
  if (l.length < 3 || l.length > 90) return false;
  if (/[.!?:;,]["'”’)\]]?$/.test(l)) return false;
  const words = l.split(/\s+/);
  if (words.length > 12) return false;
  if (!/^[\p{Lu}\d]/u.test(l)) return false;
  // Mostly capitalised words, or a short label.
  const caps = words.filter((w) => /^[\p{Lu}\d(“"']/u.test(w)).length;
  return caps >= Math.ceil(words.length / 2) || words.length <= 4;
}

function cleanHeading(h: string) {
  return singleLine(h).replace(/^#+\s*/, "").replace(/^\d+(\.\d+)*[.)]?\s+/, "").trim();
}

function toSections(text: string): Section[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const sections: Section[] = [{ heading: null, paragraphs: [] }];
  const cur = () => sections[sections.length - 1];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    const flushPara = () => {
      if (para.length) cur().paragraphs.push(para.join(" "));
      para = [];
    };
    for (const line of lines) {
      if (isHeading(line) && !(lines.length === 1 && blocks.length === 1)) {
        flushPara();
        sections.push({ heading: cleanHeading(line), paragraphs: [] });
      } else {
        // Keep list items ("No Longer at Ease (1960): …") as their own lines inside a paragraph.
        para.push(line);
      }
    }
    flushPara();
  }
  return sections.filter((s) => s.paragraphs.length || s.heading);
}

/** Detect what the document is about: leading proper name, title line, frequent name, or filename. */
export function detectSubject(raw: string, filename?: string): string | null {
  const text = normalizeDocumentText(raw);
  const firstLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const NAME = /^((?:[\p{Lu}][\p{L}'’.\-]+\s+){0,3}[\p{Lu}][\p{L}'’\-]+)/u;

  // 1. Document opens with a proper name: "Chinua Achebe (born …) was …"
  for (const line of firstLines.slice(0, 3)) {
    if (isHeading(line)) {
      const h = cleanHeading(line);
      // A title line like "Chinua Achebe" or "The Benin Kingdom" (not a generic section label).
      if (h.split(/\s+/).length <= 6 && !/^(introduction|summary|abstract|contents|overview|background)$/i.test(h)) return h;
      continue;
    }
    const m = line.match(NAME);
    if (m) {
      const words = m[1].replace(/[.’']+$/, "").split(/\s+/);
      while (words.length && NON_SUBJECT_LEAD.has(words[0].toLowerCase())) words.shift();
      if (words.length >= 2 || (words.length === 1 && words[0].length >= 4 && !NON_SUBJECT_LEAD.has(words[0].toLowerCase()))) {
        if (words.length >= 2 || /\b(is|was|were|are)\b/.test(line.slice(0, 120))) return words.join(" ");
      }
    }
    break;
  }

  // 2. Most frequent capitalised two/three-word name.
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b([\p{Lu}][\p{Ll}'’\-]+(?:\s+[\p{Lu}][\p{Ll}'’\-]+){1,2})\b/gu)) {
    const n = m[1];
    if (NON_SUBJECT_LEAD.has(n.split(/\s+/)[0].toLowerCase())) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 3) return best[0];

  // 3. Filename hint: "chinua_achebe.txt" → "Chinua Achebe".
  if (filename) {
    const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
    if (base.length >= 3 && base.length <= 60 && /[a-z]/i.test(base) && !/^(document|file|upload|scan|untitled|new)\b/i.test(base)) {
      return base.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
    }
  }
  return null;
}

function splitLongParagraph(p: string): string[] {
  const sentences = p.match(/[^.!?]+[.!?]+["'”’)\]]?\s*|[^.!?]+$/g) || [p];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && (buf + s).length > TARGET_CHARS) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

interface Chunk {
  headings: string[];
  body: string;
  /** Local topic inside the document (e.g. "Chinua Achebe International Airport"). */
  topic: string | null;
}

/** A paragraph that introduces a named thing: "Chinua Achebe International Airport (ICAO: DNAN) is an airport…" */
function topicFromParagraph(p: string, subject: string | null): string | null {
  const m = p.match(/^((?:[\p{Lu}][\p{L}'’\-]+\s+){1,6}[\p{Lu}][\p{L}'’\-]+)(?:\s*\([^)]{0,80}\))?,?\s+(?:is|was|are|were)\b/u);
  if (!m) return null;
  const name = m[1].trim();
  if (NON_SUBJECT_LEAD.has(name.split(/\s+/)[0].toLowerCase())) return null;
  if (subject && name.toLowerCase() === subject.toLowerCase()) return null;
  return name;
}

function chunkSections(sections: Section[], target: number, max: number, subject: string | null): Chunk[] {
  const chunks: Chunk[] = [];
  let topic: string | null = null;
  let cur: Chunk = { headings: [], body: "", topic: null };
  const flush = () => {
    if (cur.body.trim()) chunks.push({ headings: cur.headings, body: cur.body.trim(), topic: cur.topic });
    cur = { headings: [], body: "", topic };
  };
  for (const sec of sections) {
    // A heading that names the subject ("Naming an Aircraft After Chinua Achebe") opens a new local topic.
    if (sec.heading && subject && sec.heading.toLowerCase() !== subject.toLowerCase() && mentions(sec.heading, subject)) {
      topic = sec.heading;
      if (cur.body.length >= MIN_CHARS / 2) flush();
      cur.topic = topic;
    }
    // New section: start a fresh chunk unless the current one is too thin to stand alone.
    if (sec.heading && cur.body.length >= MIN_CHARS) flush();
    if (sec.heading && sec.heading !== topic && !cur.headings.includes(sec.heading)) cur.headings.push(sec.heading);
    for (const p of sec.paragraphs) {
      const t = topicFromParagraph(p, subject);
      if (t && t !== topic) {
        topic = t;
        if (cur.body.length >= MIN_CHARS / 2) flush();
        cur.topic = topic;
      }
      const pieces = p.length > max ? splitLongParagraph(p) : [p];
      for (const piece of pieces) {
        if (cur.body && (cur.body.length + piece.length + 2 > max || cur.body.length >= target)) {
          const keep = sec.heading && sec.heading !== topic ? sec.heading : null;
          flush();
          if (keep) cur.headings.push(keep);
        }
        if (!cur.body) cur.topic = topic;
        cur.body = cur.body ? `${cur.body}\n\n${piece}` : piece;
      }
    }
  }
  flush();
  // Fold a thin tail into the previous chunk.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    if (last.body.length < MIN_CHARS / 2 && prev.body.length + last.body.length < MAX_CONTENT - 200) {
      prev.body = `${prev.body}\n\n${last.body}`;
      for (const h of last.headings) if (!prev.headings.includes(h)) prev.headings.push(h);
      chunks.pop();
    }
  }
  const solid = chunks.filter((c) => c.body.length >= 40);
  return solid.length ? solid : chunks;
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function mentions(text: string, subject: string) {
  const lower = text.toLowerCase();
  if (lower.includes(subject.toLowerCase())) return true;
  // "Achebe" alone counts as mentioning "Chinua Achebe".
  return subject.split(/\s+/).filter((w) => w.length >= 4).some((w) => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(lower));
}

function makeTitle(chunk: Chunk, subject: string | null, index: number, total: number): string {
  const heading = chunk.headings[0];
  const firstSentence = singleLine(chunk.body).split(/(?<=[.!?])\s/)[0] || "";
  if (chunk.topic) return clip(heading ? `${chunk.topic}: ${heading}` : chunk.topic, 120);
  if (heading) {
    if (!subject || heading.toLowerCase().includes(subject.toLowerCase())) return clip(heading, 120);
    if (subject.toLowerCase() === heading.toLowerCase()) return clip(heading, 120);
    return clip(`${subject}: ${heading}`, 120);
  }
  if (firstSentence && !PRONOUN_START.test(firstSentence) && (!subject || mentions(firstSentence, subject))) {
    return clip(firstSentence, 120);
  }
  if (subject) return clip(total > 1 ? `${subject} (part ${index + 1})` : subject, 120);
  return clip(firstSentence, 120) || `Extract ${index + 1}`;
}

/**
 * Split text into draft records. Rule-based — no AI call.
 *
 * - Respects section headings and merges paragraphs toward ~1100 chars (max ~1500).
 * - Detects the document subject and stamps every extract with it, so a chunk that
 *   starts "He married…" still says who "he" is when read alone (feed, Ask).
 * - If the text would exceed MAX_RECORDS_PER_UPLOAD, chunks grow instead of the tail being dropped.
 */
export function splitDocument(raw: string, opts: { filename?: string } = {}): SplitResult {
  const text = normalizeDocumentText(raw);
  if (!text) return { subject: null, records: [] };
  let sections = toSections(text);

  // PDFs often have no blank lines: fall back to single newlines ending a sentence.
  const paraCount = sections.reduce((n, s) => n + s.paragraphs.length, 0);
  if (paraCount <= 1 && text.length > TARGET_CHARS * 1.5) {
    const paras = text.split(/(?<=[.!?])\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
    sections = [{ heading: null, paragraphs: paras }];
  }

  const subject = detectSubject(text, opts.filename);

  let target = TARGET_CHARS;
  let max = MAX_CHARS;
  let chunks = chunkSections(sections, target, max, subject);
  while (chunks.length > MAX_RECORDS_PER_UPLOAD && max < MAX_CONTENT - 300) {
    target = Math.round(target * 1.3);
    max = Math.min(MAX_CONTENT - 300, Math.round(max * 1.3));
    chunks = chunkSections(sections, target, max, subject);
  }
  chunks = chunks.slice(0, MAX_RECORDS_PER_UPLOAD);

  const records = chunks.map((c, i) => {
    let body = c.body;
    const heading = c.headings[0];
    // Context line on every extract that doesn't already open with the subject.
    const opening = singleLine(body).slice(0, 80).toLowerCase();
    if (subject && !opening.startsWith(subject.toLowerCase())) {
      const ctx = [subject];
      if (c.topic && c.topic.toLowerCase() !== subject.toLowerCase()) ctx.push(c.topic);
      if (heading && !ctx.some((x) => x.toLowerCase() === heading.toLowerCase())) ctx.push(heading);
      body = `About ${ctx.join(" · ")}\n\n${body}`;
    }
    return { title: makeTitle(c, subject, i, chunks.length), content: body.slice(0, MAX_CONTENT) };
  });
  return { subject, records };
}

/** Back-compat wrapper. */
export function splitIntoRecords(raw: string, opts: { filename?: string } = {}): DraftRecord[] {
  return splitDocument(raw, opts).records;
}
