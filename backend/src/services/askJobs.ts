import { randomUUID } from "node:crypto";
import { HttpError } from "../middleware/error.js";

/**
 * In-memory Ask jobs. The model call (RunPod) can take 1–2 minutes on a cold start, longer than
 * Coolify/Traefik/Next will hold an HTTP request open. So Ask returns a job id at once and the
 * browser polls briefly; the answer is never dropped after RunPod has finished (and billed).
 * Single backend replica only — jobs live in this process's memory.
 */
export type AskJobStatus = "pending" | "done" | "error";

export interface AskJobSource {
  id: string;
  title: string;
  type: string;
}

export interface AskJob {
  id: string;
  status: AskJobStatus;
  answer?: string;
  sources?: AskJobSource[];
  error?: string;
  createdAt: number;
  chatId?: string;
  messageId?: string;
  /** Owner for signed-in jobs; guests have none. */
  userId?: string;
  /** Saved assistant message (signed-in jobs), same shape as the old sync response. */
  message?: unknown;
  /** Chat title after this answer (signed-in jobs). */
  title?: string;
  /** True while an AI title is still being generated after the answer landed (keep polling briefly). */
  titlePending?: boolean;
}

const TTL_MS = 15 * 60 * 1000;
const MAX_PENDING = 50;
const jobs = new Map<string, AskJob>();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}

export function createAskJob(opts: { chatId?: string; userId?: string } = {}): string {
  sweep();
  let pending = 0;
  for (const j of jobs.values()) if (j.status === "pending") pending++;
  if (pending >= MAX_PENDING) {
    throw new HttpError(429, "Ask is busy right now. Please try again in a minute.", true);
  }
  const id = randomUUID();
  jobs.set(id, { id, status: "pending", createdAt: Date.now(), ...opts });
  return id;
}

export function getAskJob(id: string): AskJob | undefined {
  sweep();
  return jobs.get(id);
}

export function completeAskJob(id: string, data: Partial<Omit<AskJob, "id" | "createdAt" | "status">>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, data, { status: "done" as const });
}

/** Update a finished job in place (e.g. the AI chat title landing after the answer). */
export function patchAskJob(id: string, data: Partial<Pick<AskJob, "title" | "titlePending">>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, data);
}

export function failAskJob(id: string, error: string) {
  const job = jobs.get(id);
  if (job) Object.assign(job, { status: "error" as const, error });
}
