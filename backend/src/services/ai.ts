import { prisma } from "./prisma.js";
import { createEmbedding, embeddingToSql, embeddingsEnabled } from "./embeddings.js";
import { singleLine } from "./text.js";
import { chatConfig } from "../config.js";

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

export async function retrieveContext(query: string, limit = 5): Promise<RetrievedSource[]> {
  let results: RetrievedSource[] = [];
  if (embeddingsEnabled()) {
    try {
      const vector = embeddingToSql(await createEmbedding(query));
      const rows = await prisma.$queryRawUnsafe<
        Array<{ id: string; title: string; content: string; type: string; distance: number }>
      >(
        `SELECT id, title, content, type::text AS type, embedding <=> $1::vector AS distance
         FROM knowledge_records
         WHERE status = 'VERIFIED' AND embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $2`,
        vector,
        limit
      );
      results = rows
        .filter((r) => Number(r.distance) <= MAX_DISTANCE)
        .map((r) => ({ ...r, distance: Number(r.distance) }));
    } catch (err) {
      console.error("[ai] vector retrieval failed, falling back to keyword:", (err as Error).message);
    }
  }
  if (results.length === 0) results = await keywordRetrieve(query, limit);
  return results.map((r) => ({ ...r, title: singleLine(r.title), content: singleLine(r.content) }));
}

/** Postgres full-text fallback. Free, no embeddings needed. */
async function keywordRetrieve(query: string, limit: number): Promise<RetrievedSource[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string; content: string; type: string; rank: number }>
  >(
    `SELECT id, title, content, type::text AS type,
            ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $1)) AS rank
     FROM knowledge_records
     WHERE status = 'VERIFIED'
       AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    query,
    limit
  );
  return rows.filter((r) => Number(r.rank) > 0.01);
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
  if (!raw || !String(raw).trim()) return NO_INFO;
  return humanizeAnswer(String(raw));
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
    const body = s.content.slice(0, Math.max(0, budget));
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

  // No model configured: return verified excerpts directly (zero cost).
  if (!chat.configured) {
    const answer = sources.map((s) => `${s.title}: ${s.content.slice(0, 400)}`).join("\n\n");
    return { answer: humanizeAnswer(answer), sources };
  }

  let answer: string;
  if (chat.openaiCompatible) {
    // RunPod (and most hosts): OpenAI-compatible /chat/completions
    const url = `${chat.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chat.key}`,
      },
      body: JSON.stringify({
        model: chat.model,
        messages,
        max_tokens: 700,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Chat model error: ${res.status} ${await res.text()}`);
    answer = extractAnswer(await res.json());
  } else {
    // Legacy RunPod serverless /v2/{id}/runsync
    const res = await fetch(`https://api.runpod.ai/v2/${chat.endpointId}/runsync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chat.key}` },
      body: JSON.stringify({
        input: {
          messages,
          sampling_params: { max_tokens: 700, temperature: 0.2, top_p: 1, top_k: -1, seed: -1 },
        },
      }),
    });
    if (!res.ok) throw new Error(`Runpod error: ${res.status} ${await res.text()}`);
    answer = extractAnswer(await res.json());
  }
  const lower = answer.toLowerCase();
  if (lower.includes("no verified information") || lower.includes("knowledge base currently contains no")) {
    return { answer: NO_INFO, sources: [] };
  }
  return { answer, sources };
}
