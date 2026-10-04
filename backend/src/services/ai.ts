import { prisma } from "./prisma.js";
import { createEmbedding, embeddingToSql } from "./embeddings.js";

const SYSTEM_PROMPT = `You are Aphring AI.

You answer only from supplied context.

If information is missing, say:
"The Aphring knowledge base currently contains no verified information about this topic."

Always cite sources.`;

interface RetrievedSource {
  id: string;
  title: string;
  content: string;
  type: string;
}

export async function retrieveContext(
  query: string,
  limit = 5
): Promise<RetrievedSource[]> {
  const embedding = await createEmbedding(query);
  const vector = embeddingToSql(embedding);

  // Raw query for pgvector cosine similarity
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

  return results.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type,
  }));
}

export async function generateAnswer(
  question: string,
  sources: RetrievedSource[]
): Promise<string> {
  const context =
    sources.length === 0
      ? "No verified sources found."
      : sources
          .map(
            (s, i) =>
              `Source ${i + 1} [${s.type}]: ${s.title}\n${s.content}`
          )
          .join("\n\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;

  if (!endpointId || !apiKey) {
    // Dev fallback
    if (sources.length === 0) {
      return "The Aphring knowledge base currently contains no verified information about this topic.";
    }
    return (
      `Based on verified Aphring sources:\n\n` +
      sources.map((s, i) => `${i + 1}. ${s.title}: ${s.content.slice(0, 300)}...`).join("\n\n") +
      `\n\n(Sources: ${sources.map((s) => s.id).join(", ")})`
    );
  }

  // Runpod serverless endpoint call
  const res = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/runsync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: {
          messages,
          max_tokens: 1024,
          temperature: 0.2,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Runpod error: ${err}`);
  }

  const data = await res.json();
  const answer =
    data.output?.choices?.[0]?.message?.content ||
    data.output?.text ||
    data.output ||
    "Unable to generate answer.";

  // Append citations
  if (sources.length > 0) {
    const cites = sources
      .map((s, i) => `[${i + 1}] ${s.title}`)
      .join(" · ");
    return `${answer}\n\n---\nSources: ${cites}`;
  }

  return answer;
}

export async function extractFactsFromText(
  text: string,
  uploadedById: string
): Promise<{ title: string; content: string; type: string }[]> {
  // Simple heuristic extraction for Phase 1.
  // Phase 2 can replace with full LLM extraction.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 80);

  const facts = paragraphs.slice(0, 10).map((p, i) => {
    const firstLine = p.split("\n")[0].slice(0, 120);
    return {
      title: firstLine || `Extracted fact ${i + 1}`,
      content: p.slice(0, 2000),
      type: "history",
    };
  });

  return facts;
}
