import crypto from "crypto";
import { embeddingConfig, isProduction } from "../config.js";
import { prisma } from "./prisma.js";

export class EmbeddingsDisabledError extends Error {
  constructor() {
    super("Embeddings are not configured (EMBEDDING_API_KEY missing)");
  }
}

export function embeddingsEnabled() {
  return embeddingConfig().enabled;
}

export function contentHash(title: string, content: string) {
  return crypto.createHash("sha256").update(`${title}\n${content}`).digest("hex");
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  const cfg = embeddingConfig();
  if (!cfg.enabled) throw new EmbeddingsDisabledError();
  if (cfg.fake) {
    if (isProduction) throw new EmbeddingsDisabledError(); // belt and braces
    return inputs.map(pseudoEmbedding);
  }
  const res = await fetch(`${cfg.url}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, input: inputs.map((t) => t.slice(0, 8000)) }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

export async function createEmbedding(text: string): Promise<number[]> {
  return (await createEmbeddings([text]))[0];
}

/** Dev-only deterministic vector. Never reachable when NODE_ENV=production. */
function pseudoEmbedding(text: string): number[] {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return Array.from({ length: 1536 }, (_, i) => Math.sin(h + i) * 0.5);
}

export function embeddingToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Embed VERIFIED records whose text changed since the last embedding.
 * Called on verify / accepted correction, and by the workstation re-index action.
 * Returns the number of records embedded. Never throws on provider errors.
 */
export async function embedRecords(recordIds: string[]): Promise<number> {
  if (!embeddingsEnabled() || recordIds.length === 0) return 0;
  const records = await prisma.knowledgeRecord.findMany({
    where: { id: { in: recordIds }, status: "VERIFIED" },
    select: { id: true, title: true, content: true, embeddedHash: true },
  });
  const todo = records
    .map((r) => ({ ...r, hash: contentHash(r.title, r.content) }))
    .filter((r) => r.hash !== r.embeddedHash);
  let done = 0;
  for (let i = 0; i < todo.length; i += 64) {
    const batch = todo.slice(i, i + 64);
    try {
      const vectors = await createEmbeddings(batch.map((r) => `${r.title}\n${r.content}`));
      for (let j = 0; j < batch.length; j++) {
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_records SET embedding = $1::vector, embedded_hash = $2, embedded_at = now() WHERE id = $3`,
          embeddingToSql(vectors[j]),
          batch[j].hash,
          batch[j].id
        );
        done++;
      }
    } catch (err) {
      console.error("[embeddings] batch failed:", (err as Error).message);
    }
  }
  return done;
}

/** Ids of VERIFIED records with no (or stale) embedding. */
export async function staleVerifiedIds(limit = 500): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM knowledge_records WHERE status = 'VERIFIED' AND (embedding IS NULL OR embedded_hash IS NULL) LIMIT $1`,
    limit
  );
  return rows.map((r) => r.id);
}
