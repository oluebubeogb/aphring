/**
 * Emailed verification words (email confirmation and password reset).
 * - Words come from a Nigerian word list (names, places, foods, animals…), shown lowercase.
 * - Matching is case- and spacing-insensitive: "Ikenna", "IKENNA", "ikenna" all work.
 * - Only an HMAC of the normalised word is stored; challenges expire and allow few attempts.
 */
import crypto from "crypto";
import { EmailPurpose } from "@prisma/client";
import { prisma } from "./prisma.js";
import { NIGERIAN_WORDS } from "./words.js";
import { getJwtSecret, mailConfig } from "../config.js";
import { sendMail, wordEmail } from "./mail.js";
import { HttpError } from "../middleware/error.js";

const SETTINGS: Record<EmailPurpose, { words: number; minutes: number }> = {
  // Low risk: you must already be signed in to confirm your own address.
  VERIFY_EMAIL: { words: 1, minutes: 30 },
  // Higher risk: two words (e.g. "kaduna suya") so it can't be guessed in a few tries.
  RESET_PASSWORD: { words: 2, minutes: 20 },
};
const MAX_ATTEMPTS = 5;
const MIN_SECONDS_BETWEEN_SENDS = 60;
const MAX_SENDS_PER_HOUR = 5;

export function normalizeWord(input: string) {
  return input.normalize("NFKD").toLowerCase().replace(/[^a-z]/g, "");
}

function hashWord(userId: string, purpose: EmailPurpose, word: string) {
  return crypto.createHmac("sha256", getJwtSecret()).update(`${purpose}:${userId}:${normalizeWord(word)}`).digest("hex");
}

function pickWords(n: number) {
  const out: string[] = [];
  while (out.length < n) {
    const w = NIGERIAN_WORDS[crypto.randomInt(NIGERIAN_WORDS.length)];
    if (!out.includes(w)) out.push(w);
  }
  return out.join(" ");
}

export class TooSoonError extends HttpError {
  constructor(seconds: number) {
    super(429, `Please wait ${seconds}s before asking for another word.`);
  }
}

/** Create a challenge and email it. Throws TooSoonError when rate-limited; mail errors propagate. */
export async function issueChallenge(
  user: { id: string; name: string; email: string },
  purpose: EmailPurpose
): Promise<{ provider: string; expiresInMinutes: number }> {
  const recent = await prisma.emailChallenge.findMany({
    where: { userId: user.id, purpose, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent[0]) {
    const age = (Date.now() - recent[0].createdAt.getTime()) / 1000;
    if (age < MIN_SECONDS_BETWEEN_SENDS) throw new TooSoonError(Math.ceil(MIN_SECONDS_BETWEEN_SENDS - age));
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) throw new HttpError(429, "Too many words requested. Try again in an hour.");

  const cfg = SETTINGS[purpose];
  const word = pickWords(cfg.words);
  // Only the newest challenge is valid.
  await prisma.emailChallenge.updateMany({
    where: { userId: user.id, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailChallenge.create({
    data: {
      userId: user.id,
      purpose,
      codeHash: hashWord(user.id, purpose, word),
      expiresAt: new Date(Date.now() + cfg.minutes * 60_000),
    },
  });

  const app = mailConfig().appUrl;
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const content =
    purpose === "VERIFY_EMAIL"
      ? wordEmail({
          name: firstName,
          heading: "Confirm your email",
          intro: "welcome to Aphring. Here is your word to confirm this address:",
          word,
          minutes: cfg.minutes,
          actionLabel: "Open Aphring to confirm",
          actionUrl: `${app}/verify-email`,
          footnote: "If you didn't create an Aphring account, you can ignore this email.",
        })
      : wordEmail({
          name: firstName,
          heading: "Reset your password",
          intro: "someone (hopefully you) asked to reset your Aphring password. Use these words:",
          word,
          minutes: cfg.minutes,
          actionLabel: "Choose a new password",
          actionUrl: `${app}/reset-password?email=${encodeURIComponent(user.email)}`,
          footnote: "If you didn't ask for this, ignore this email — your password stays the same.",
        });
  const subject = purpose === "VERIFY_EMAIL" ? `Your Aphring word: ${word}` : "Reset your Aphring password";
  const sent = await sendMail({
    to: user.email,
    subject,
    ...content,
    consoleSummary: `purpose=${purpose} word="${word}"`,
  });
  return { provider: sent.provider, expiresInMinutes: cfg.minutes };
}

/** Check a word. Consumes the challenge on success; counts attempts on failure. */
export async function checkChallenge(userId: string, purpose: EmailPurpose, word: string): Promise<boolean> {
  const ch = await prisma.emailChallenge.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!ch || ch.expiresAt < new Date() || ch.attempts >= MAX_ATTEMPTS) return false;
  const expected = Buffer.from(ch.codeHash, "hex");
  const given = Buffer.from(hashWord(userId, purpose, word), "hex");
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!ok) {
    await prisma.emailChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.emailChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
  return true;
}
