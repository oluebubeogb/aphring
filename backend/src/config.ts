/**
 * Centralised runtime configuration. Fails fast in production when
 * security-critical values are missing or weak.
 */
import dotenv from "dotenv";

dotenv.config();

export const isProduction = process.env.NODE_ENV === "production";

const KNOWN_BAD_SECRETS = new Set([
  "dev-secret",
  "change-me-in-production",
  "change-me-to-a-long-random-string",
  "secret",
  "changeme",
]);

const DEV_JWT_SECRET = "DEV-ONLY-insecure-jwt-secret-do-not-use-in-production";

let cachedSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const raw = (process.env.JWT_SECRET || "").trim();
  if (isProduction) {
    if (!raw) throw new Error("JWT_SECRET is required when NODE_ENV=production");
    if (raw.length < 32 || KNOWN_BAD_SECRETS.has(raw)) {
      throw new Error(
        "JWT_SECRET is too weak: use at least 32 random characters (e.g. `openssl rand -hex 32`)"
      );
    }
    cachedSecret = raw;
  } else {
    if (!raw) {
      console.warn("[config] JWT_SECRET not set — using explicit DEV-only secret (NODE_ENV != production)");
    }
    cachedSecret = raw || DEV_JWT_SECRET;
  }
  return cachedSecret;
}

/** Usernames from ADMIN_USERNAMES (comma separated), lower-cased and trimmed. */
export function getAdminUsernames(): Set<string> {
  return new Set(
    (process.env.ADMIN_USERNAMES || "")
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isEnvAdmin(username: string): boolean {
  return getAdminUsernames().has(username.trim().toLowerCase());
}

/** Real embeddings configured? Pseudo-embeddings are never allowed in production. */
export function embeddingConfig() {
  const key = (process.env.EMBEDDING_API_KEY || "").trim();
  const allowFake = !isProduction && process.env.ALLOW_FAKE_EMBEDDINGS === "true";
  return {
    url: process.env.EMBEDDING_API_URL || "https://api.openai.com/v1",
    key,
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    enabled: !!key || allowFake,
    fake: !key && allowFake,
  };
}


/** OpenAI-compatible chat (RunPod base URL + model + API key). */
export function chatConfig() {
  const key = (process.env.RUNPOD_API_KEY || process.env.CHAT_API_KEY || "").trim();
  const baseUrl = (process.env.RUNPOD_BASE_URL || process.env.CHAT_API_URL || "").trim().replace(/\/$/, "");
  const model = (process.env.RUNPOD_MODEL || process.env.CHAT_MODEL || "").trim();
  // Legacy serverless endpoint (optional fallback)
  let endpointId = (process.env.RUNPOD_ENDPOINT_ID || "").trim();
  const m = endpointId.match(/\/v2\/([^/]+)/);
  if (m) endpointId = m[1];
  endpointId = endpointId.replace(/\/runsync\/?$/, "").replace(/\/$/, "");
  const openaiCompatible = !!(key && baseUrl && model);
  const legacyServerless = !!(key && endpointId);
  return {
    key,
    baseUrl,
    model,
    endpointId,
    openaiCompatible,
    legacyServerless,
    configured: openaiCompatible || legacyServerless,
  };
}

export type MailProvider = "resend" | "smtp" | "console";

/**
 * Outgoing mail. MAIL_PROVIDER=resend|smtp|console. If unset we pick resend when
 * RESEND_API_KEY is present, smtp when SMTP_HOST is present, otherwise console
 * (the word is written to the server log so sign-up still works without mail).
 */
export function mailConfig() {
  const env = (k: string) => (process.env[k] || "").trim();
  const resendKey = env("RESEND_API_KEY");
  const smtpHost = env("SMTP_HOST");
  let provider = env("MAIL_PROVIDER").toLowerCase() as MailProvider | "";
  if (provider !== "resend" && provider !== "smtp" && provider !== "console") {
    provider = resendKey ? "resend" : smtpHost ? "smtp" : "console";
  }
  const smtpPort = Number(env("SMTP_PORT") || 587);
  const appUrl = (env("APP_URL") || env("FRONTEND_URL") || "http://localhost:3000").replace(/\/$/, "");
  return {
    provider: provider as MailProvider,
    from: env("MAIL_FROM") || "Aphring <no-reply@aphring.local>",
    resendKey,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: env("SMTP_SECURE") ? env("SMTP_SECURE") === "true" : smtpPort === 465,
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
    appUrl,
  };
}

export function validateStartupConfig() {
  getJwtSecret();
  const emb = embeddingConfig();
  if (!emb.enabled) {
    console.warn(
      "[config] EMBEDDING_API_KEY not set — vector search disabled; chat falls back to keyword retrieval."
    );
  } else if (emb.fake) {
    console.warn("[config] ALLOW_FAKE_EMBEDDINGS=true — pseudo-embeddings in use (dev only).");
  }
  if (getAdminUsernames().size === 0) {
    console.warn("[config] ADMIN_USERNAMES is empty — nobody will have admin access.");
  }
  const mail = mailConfig();
  if (mail.provider === "console") {
    console.warn("[config] MAIL_PROVIDER=console — verification words are written to this log, not emailed.");
  } else if (mail.provider === "resend" && !mail.resendKey) {
    console.warn("[config] MAIL_PROVIDER=resend but RESEND_API_KEY is empty — emails will fail.");
  } else if (mail.provider === "smtp" && !mail.smtp.host) {
    console.warn("[config] MAIL_PROVIDER=smtp but SMTP_HOST is empty — emails will fail.");
  }
  const chat = chatConfig();
  if (!chat.configured) {
    console.warn(
      "[config] Chat model not set (RUNPOD_API_KEY + RUNPOD_BASE_URL + RUNPOD_MODEL) — Ask quotes verified excerpts."
    );
  }
}
