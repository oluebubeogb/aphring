import { prisma } from "./prisma.js";
import { createEmbedding, embeddingToSql } from "./embeddings.js";

const SYSTEM_PROMPT = `You are Aphring AI — a helpful assistant for Nigeria's community knowledge network.

Rules:
1. Answer ONLY from the supplied context. Do not invent facts.
2. Write in clear, natural language for everyday readers. No JSON, no code fences, no escape sequences, no markdown tables unless truly needed.
3. Prefer short paragraphs and plain sentences.
4. If the context does not contain relevant information for the question, reply with exactly this sentence and nothing else:
The Aphring knowledge base currently contains no verified information about this topic.
5. When you do answer from context, do not invent source labels in the body — the system will attach sources separately only when relevant.
6. Strip any odd characters from source text (control characters, excessive backslashes) and rephrase into readable prose.`;

interface RetrievedSource {
  id: string;
  title: string;
  content: string;
  type: string;
  distance?: number;
}

const NO_INFO =
  "The Aphring knowledge base currently contains no verified information about this topic.";

/** Distance threshold: higher = less similar. Only keep tight matches. */
const MAX_DISTANCE = 0.55;

export async function retrieveContext(
  query: string,
  limit = 5
): Promise<RetrievedSource[]> {
  const embedding = await createEmbedding(query);
  const vector = embeddingToSql(embedding);

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      type: string;
      distance: number;
    }>
  >(
    `
    SELECT id, title, content, type,
           embedding <=> $1::vector AS distance
    FROM knowledge_records
    WHERE status = 'VERIFIED' AND embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT $2
    `,
    vector,
    limit
  );

  // Only return sources that are actually similar to the question
  return results
    .filter((r) => Number(r.distance) <= MAX_DISTANCE)
    .map((r) => ({
      id: r.id,
      title: cleanText(r.title),
      content: cleanText(r.content),
      type: r.type,
      distance: Number(r.distance),
    }));
}

function cleanText(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnswer(data: any): string {
  let raw = "";

  if (data?.output?.choices?.[0]?.tokens) {
    const tokens = data.output.choices[0].tokens;
    raw = Array.isArray(tokens) ? tokens.join("") : String(tokens);
  } else if (data?.output?.choices?.[0]?.message?.content) {
    raw = data.output.choices[0].message.content;
  } else if (data?.output?.text) {
    raw = data.output.text;
  } else if (typeof data?.output === "string") {
    raw = data.output;
  } else if (data?.choices?.[0]?.message?.content) {
    raw = data.choices[0].message.content;
  } else if (data?.output != null) {
    // Avoid dumping raw JSON to the user
    if (typeof data.output === "object") {
      const o = data.output;
      raw =
        o.text ||
        o.response ||
        o.generated_text ||
        o.choices?.[0]?.tokens?.join?.("") ||
        o.choices?.[0]?.message?.content ||
        "";
    }
  }

  if (!raw || !String(raw).trim()) {
    return NO_INFO;
  }

  return humanizeAnswer(String(raw));
}

function humanizeAnswer(text: string): string {
  let t = text.trim();

  // Strip code fences / JSON wrappers if model leaked them
  t = t.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "");
  t = t.replace(/^\{[\s\S]*"content"\s*:\s*"/, "").replace(/"\s*\}\s*$/, "");

  t = cleanText(t);

  // Unescape leftover sequences
  t = t
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

export async function generateAnswer(
  question: string,
  sources: RetrievedSource[]
): Promise<{ answer: string; sources: RetrievedSource[] }> {
  // No relevant sources → fixed message, empty sources list
  if (sources.length === 0) {
    return { answer: NO_INFO, sources: [] };
  }

  const context = sources
    .map(
      (s, i) =>
        `Source ${i + 1} (${s.type}): ${s.title}\n${s.content}`
    )
    .join("\n\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context from the Aphring knowledge base:\n\n${context}\n\nQuestion: ${question}\n\nWrite a clear answer for a general reader. Use only the context above.`,
    },
  ];

  let endpointId = (process.env.RUNPOD_ENDPOINT_ID || "").trim();
  const apiKey = process.env.RUNPOD_API_KEY;

  if (endpointId.includes("api.runpod.ai")) {
    const match = endpointId.match(/\/v2\/([^/]+)/);
    if (match) endpointId = match[1];
  }
  endpointId = endpointId.replace(/\/runsync\/?$/, "").replace(/\/$/, "");

  // Dev / no keys fallback
  if (!endpointId || !apiKey) {
    const answer =
      sources
        .map((s) => `${s.title}: ${s.content.slice(0, 400)}`)
        .join("\n\n") || NO_INFO;
    return {
      answer: humanizeAnswer(answer),
      sources,
    };
  }

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: {
        messages,
        sampling_params: {
          max_tokens: 1024,
          temperature: 0.2,
          top_p: 1,
          top_k: -1,
          seed: -1,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Runpod error: ${res.status} ${err}`);
  }

  const data = await res.json();
  let answer = extractAnswer(data);

  // If model still claims no info, drop sources
  const noInfo =
    answer.toLowerCase().includes("no verified information") ||
    answer.toLowerCase().includes("knowledge base currently contains no");

  if (noInfo) {
    return { answer: NO_INFO, sources: [] };
  }

  // Human footer only when sources were actually used
  const cites = sources.map((s, i) => `${i + 1}. ${s.title}`).join("\n");
  answer = `${answer}\n\nSources:\n${cites}`;

  return { answer, sources };
}

export async function extractFactsFromText(
  text: string,
  _uploadedById: string
): Promise<{ title: string; content: string; type: string }[]> {
  const paragraphs = cleanText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 80);

  return paragraphs.slice(0, 10).map((p, i) => {
    const firstLine = p.split(/[.!?\n]/)[0].slice(0, 120);
    return {
      title: firstLine || `Extracted fact ${i + 1}`,
      content: p.slice(0, 2000),
      type: "history",
    };
  });
}
