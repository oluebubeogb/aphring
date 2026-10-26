import { prisma } from "./prisma.js";
import { createEmbedding, embeddingToSql, embeddingsEnabled } from "./embeddings.js";
import { singleLine } from "./text.js";
import { chatConfig } from "../config.js";
import { HttpError } from "../middleware/error.js";

const SYSTEM_PROMPT = `You are Aphring AI — a helpful assistant for Nigeria's community knowledge network.

Rules:
1. Answer ONLY from the supplied context. Do not invent facts.
2. Write in clear, natural language for everyday readers. No JSON, no code fences, no escape sequences, no markdown tables unless truly needed.
3. Prefer short paragraphs and plain sentences.
4. If the context does not contain relevant information for the question, reply with exactly this sentence and nothing else:
The Aphring knowledge base currently contains no verified information about this topic.
5. When you do answer from context, do not invent source labels in the body — the system will attach sources separately only when relevant.
6. Strip any odd characters from source text (control characters, excessive backslashes) and rephrase into readable prose.`;

export interface RetrievedSource {
  id: string;
  title: string;
  content: string;
  type: string;
  distance?: number;
}

export const NO_INFO =
  "The Aphring knowledge base currently contains no verified information about this topic.";

/** Distance threshold: higher = less similar. Only keep tight matches. */
const MAX_DISTANCE = 0.55;
/** Cost control: cap the context sent to the model. */
const MAX_CONTEXT_CHARS = 6000;
const MAX_CHARS_PER_SOURCE = 1800;
const DEFAULT_LIMIT = 6;

/** Words that carry no topic meaning in a question ("tell me about …"). */
const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does doing done for from had has have having he her hers him his how " +
    "i if in into is it its just me my of on or our ours she so some such than that the their them then there these they this those " +
    "to too us was we were what when where which while who whom whose why will with would you your yours " +
    "tell explain describe give show list say talk know knowing information info anything something everything details detail " +
    "about please kindly briefly brief summary summarise summarize history story facts fact more much many any all also " +
    "want need like find search look looking let lets let's mean means meaning called named name thing things " +
    "hi hello hey thanks thank okay ok yes no not abeg una wetin dey"
  ).split(/\s+/)
);

/** Significant lowercase tokens of a question: letters/digits only, so they're safe in SQL patterns. */
export function queryTokens(query: string): string[] {
  const words = query
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d{1,2}$/.test(w));
  return [...new Set(words)].slice(0, 8);
}

function escapeRegex(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function retrieveContext(query: string, limit = DEFAULT_LIMIT): Promise<RetrievedSource[]> {
  const keyword = await keywordRetrieve(query, limit).catch((err) => {
    console.error("[ai] keyword retrieval failed:", (err as Error).message);
    return [] as RetrievedSource[];
  });

  let vector: RetrievedSource[] = [];
  if (embeddingsEnabled()) {
    try {
      const v = embeddingToSql(await createEmbedding(query));
      const rows = await prisma.$queryRawUnsafe<
        Array<{ id: string; title: string; content: string; type: string; distance: number }>
      >(
        `SELECT id, title, content, type::text AS type, embedding <=> $1::vector AS distance
         FROM knowledge_records
         WHERE status = 'VERIFIED' AND embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $2`,
        v,
        limit
      );
      vector = rows.filter((r) => Number(r.distance) <= MAX_DISTANCE).map((r) => ({ ...r, distance: Number(r.distance) }));
    } catch (err) {
      console.error("[ai] vector retrieval failed, using keyword results only:", (err as Error).message);
    }
  }

  // Merge: strong keyword hits first (names, places), then semantic hits not already present.
  const seen = new Set<string>();
  const merged: RetrievedSource[] = [];
  for (const r of [...keyword, ...vector]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
    if (merged.length >= limit) break;
  }
  return merged.map((r) => ({ ...r, title: singleLine(r.title), content: singleLine(r.content) }));
}

/**
 * Keyword retrieval over VERIFIED records — free, no embeddings needed.
 * Matches significant tokens case-insensitively as whole words in title/content,
 * in linked entity names/aliases, and via OR full-text search (stemmed), then scores.
 * "tell me about chinua achebe" → tokens [chinua, achebe].
 */
async function keywordRetrieve(query: string, limit: number): Promise<RetrievedSource[]> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const patterns = tokens.map((t) => `\\m${escapeRegex(t)}\\M`);
  const tsq = tokens.join(" | ");

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      type: string;
      source_rank: number;
      hits: number;
      title_hits: number;
      entity_hits: number;
      rank: number;
    }>
  >(
    `WITH toks AS (SELECT unnest($1::text[]) AS p)
     SELECT k.id, k.title, k.content, k.type::text AS type, k.source_rank,
            (SELECT count(*) FROM toks WHERE (k.title || ' ' || k.content) ~* toks.p)::int AS hits,
            (SELECT count(*) FROM toks WHERE k.title ~* toks.p)::int AS title_hits,
            (SELECT count(DISTINCT toks.p) FROM toks, knowledge_entities ke JOIN entities e ON e.id = ke.entity_id
               WHERE ke.knowledge_record_id = k.id
                 AND (e.name ~* toks.p OR array_to_string(e.aliases, ' ') ~* toks.p))::int AS entity_hits,
            ts_rank(to_tsvector('english', k.title || ' ' || k.content), to_tsquery('english', $2))::float AS rank
     FROM knowledge_records k
     WHERE k.status = 'VERIFIED'
       AND (
         to_tsvector('english', k.title || ' ' || k.content) @@ to_tsquery('english', $2)
         OR EXISTS (SELECT 1 FROM toks WHERE (k.title || ' ' || k.content) ~* toks.p)
         OR EXISTS (SELECT 1 FROM knowledge_entities ke JOIN entities e ON e.id = ke.entity_id, toks
                     WHERE ke.knowledge_record_id = k.id AND e.name ~* toks.p)
       )
     ORDER BY hits DESC, rank DESC, k.source_rank DESC
     LIMIT 60`,
    patterns,
    tsq
  );
  if (rows.length === 0) return [];

  // Phrase bonus: "chinua achebe" → prefer "Chinua Achebe: Early Life…" and the record that opens with the name
  // over records that merely mention it (every extract of a document carries its subject line).
  const phrase = tokens.join(" ");
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const phraseBonus = (title: string, content: string) => {
    if (tokens.length < 2) return 0;
    const t = norm(title);
    let b = 0;
    if (t.startsWith(phrase)) b += 2;
    const head = norm(title.split(/[:—–-]/)[0] || "");
    if (head === phrase) b += 2;
    if (norm(content.replace(/^About [^\n]*\n+/, "").slice(0, 120)).startsWith(phrase)) b += 3;
    return b;
  };

  const scored = rows
    .map((r) => {
      const hits = Number(r.hits) || 0;
      const coverage = Math.max(hits, Number(r.entity_hits) || 0) / tokens.length;
      const score =
        hits * 2 +
        (Number(r.title_hits) || 0) * 1.5 +
        (Number(r.entity_hits) || 0) * 1.5 +
        (Number(r.rank) || 0) * 10 +
        coverage * 3 +
        phraseBonus(r.title, r.content) +
        Math.min(Number(r.source_rank) || 0, 30) * 0.02;
      return { r, score, coverage };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0].score;
  return scored
    .filter((x) => x.score >= best * 0.5 && (tokens.length < 3 || x.coverage >= 0.34))
    .slice(0, limit)
    .map(({ r }) => ({ id: r.id, title: r.title, content: r.content, type: r.type }));
}

/** Upstream AI failure: shown to the user as-is (not disguised as "no information"). */
export class AiServiceError extends HttpError {
  constructor(message: string) {
    super(502, message, true);
  }
}

function extractAnswer(data: any): string {
  let raw = "";
  const o = data?.output;
  if (o?.choices?.[0]?.tokens) {
    const tokens = o.choices[0].tokens;
    raw = Array.isArray(tokens) ? tokens.join("") : String(tokens);
  } else if (o?.choices?.[0]?.message?.content) raw = o.choices[0].message.content;
  else if (o?.text) raw = o.text;
  else if (typeof o === "string") raw = o;
  else if (data?.choices?.[0]?.message?.content) raw = data.choices[0].message.content;
  else if (o && typeof o === "object") raw = o.response || o.generated_text || "";
  if (Array.isArray(o) && o[0]?.choices?.[0]?.tokens) raw = o[0].choices[0].tokens.join("");
  const cleaned = humanizeAnswer(String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, ""));
  if (!cleaned) {
    if (data?.status && data.status !== "COMPLETED") {
      throw new AiServiceError(`The AI service did not finish (status ${data.status}). Please try again in a moment.`);
    }
    throw new AiServiceError("The AI service returned an empty answer. Please try again.");
  }
  return cleaned;
}

function humanizeAnswer(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function generateAnswer(
  question: string,
  sources: RetrievedSource[]
): Promise<{ answer: string; sources: RetrievedSource[] }> {
  // No relevant sources → fixed message, no model call (cost control).
  if (sources.length === 0) return { answer: NO_INFO, sources: [] };

  let budget = MAX_CONTEXT_CHARS;
  const parts: string[] = [];
  for (const [i, s] of sources.entries()) {
    const body = s.content.slice(0, Math.min(MAX_CHARS_PER_SOURCE, Math.max(0, budget)));
    if (!body) break;
    parts.push(`Source ${i + 1} (${s.type}): ${s.title}\n${body}`);
    budget -= body.length;
  }
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context from the Aphring knowledge base:\n\n${parts.join("\n\n")}\n\nQuestion: ${question}\n\nWrite a clear answer for a general reader. Use only the context above.`,
    },
  ];

  const chat = chatConfig();
  const excerpts = () =>
    humanizeAnswer(sources.map((s) => `${s.title}: ${s.content.slice(0, 400)}${s.content.length > 400 ? "…" : ""}`).join("\n\n"));

  // No model configured: return verified excerpts directly (zero cost).
  if (!chat.configured) return { answer: excerpts(), sources };

  let answer: string;
  try {
    if (chat.openaiCompatible) {
      // RunPod (and most hosts): OpenAI-compatible /chat/completions
      const res = await fetch(`${chat.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chat.key}` },
        body: JSON.stringify({ model: chat.model, messages, max_tokens: 700, temperature: 0.2 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw upstreamError(res.status, await res.text());
      answer = extractAnswer(await res.json());
    } else {
      // Legacy RunPod serverless /v2/{id}/runsync (polls /status if the job is still queued)
      const base = `https://api.runpod.ai/v2/${chat.endpointId}`;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${chat.key}` };
      const res = await fetch(`${base}/runsync`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input: { messages, sampling_params: { max_tokens: 700, temperature: 0.2, top_p: 1, top_k: -1, seed: -1 } },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw upstreamError(res.status, await res.text());
      let data: any = await res.json();
      for (let i = 0; i < 20 && data?.id && (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS"); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch(`${base}/status/${data.id}`, { headers, signal: AbortSignal.timeout(30_000) });
        if (!st.ok) throw upstreamError(st.status, await st.text());
        data = await st.json();
      }
      if (data?.status === "FAILED") throw new AiServiceError("The AI service failed to answer. Please try again.");
      answer = extractAnswer(data);
    }
  } catch (err: any) {
    if (err instanceof AiServiceError) throw err;
    console.error("[ai] chat model call failed:", err?.message || err);
    throw new AiServiceError(
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "The AI service took too long to respond. Please try again."
        : "Couldn't reach the AI service. Please try again shortly."
    );
  }

  const lower = answer.toLowerCase();
  if (lower.includes("no verified information") || lower.includes("knowledge base currently contains no")) {
    // We DID find verified records; show them rather than claiming there's nothing.
    return { answer: `Here is what the verified records say:\n\n${excerpts()}`, sources };
  }
  return { answer, sources };
}

function upstreamError(status: number, body: string) {
  console.error(`[ai] chat model HTTP ${status}: ${body.slice(0, 500)}`);
  if (status === 401 || status === 403) return new AiServiceError("The AI service rejected our credentials (check RUNPOD_API_KEY).");
  if (status === 404) return new AiServiceError("The AI model endpoint was not found (check RUNPOD_BASE_URL / RUNPOD_MODEL).");
  if (status === 429) return new AiServiceError("The AI service is busy. Please try again in a minute.");
  return new AiServiceError(`The AI service returned an error (${status}). Please try again shortly.`);
}
