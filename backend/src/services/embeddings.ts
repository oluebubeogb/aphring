export async function createEmbedding(text: string): Promise<number[]> {
  const url = process.env.EMBEDDING_API_URL || "https://api.openai.com/v1";
  const key = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  if (!key) {
    // Fallback: deterministic pseudo-embedding for local dev without keys
    const hash = simpleHash(text);
    return Array.from({ length: 1536 }, (_, i) =>
      Math.sin(hash + i) * 0.5
    );
  }

  const res = await fetch(`${url}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function embeddingToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
