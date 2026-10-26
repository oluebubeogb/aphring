import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest, signToken } from "../middleware/auth.js";
import { syncRole } from "../services/roles.js";
import { issueChallenge, checkChallenge, normalizeWord } from "../services/emailChallenge.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
/** Emailing words / checking words: tighter per-IP limits on top of per-user DB limits. */
const mailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many email requests. Try again in a few minutes." },
});
const wordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Username must be 3–30 characters: letters, numbers or underscore"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  /** Username or email. `email` accepted for backwards compatibility. */
  identifier: z.string().trim().min(1).optional(),
  email: z.string().trim().optional(),
  password: z.string().min(1),
});

function publicUser(u: {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  reputation: number;
  emailVerifiedAt?: Date | null;
}) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    reputation: u.reputation,
    emailVerified: !!u.emailVerifiedAt,
  };
}

/** Send in the background; sign-up never fails because mail is down. */
function sendVerificationQuietly(user: { id: string; name: string; email: string }) {
  issueChallenge(user, "VERIFY_EMAIL").catch((e) => console.error("[mail] verification email failed:", e?.message || e));
}

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const clash = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
      select: { email: true, username: true },
    });
    if (clash) {
      return res.status(400).json({
        error: clash.username === body.username ? "Username is taken" : "Email already registered",
      });
    }
    const user = await prisma.user.create({
      data: {
        name: body.name,
        username: body.username,
        email: body.email,
        password: await bcrypt.hash(body.password, 12),
      },
    });
    const role = await syncRole(user);
    sendVerificationQuietly(user);
    res.status(201).json({ user: publicUser({ ...user, role }), token: signToken(user), verificationSent: true });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const id = (body.identifier || body.email || "").toLowerCase();
    if (!id) return res.status(400).json({ error: "Username or email is required" });
    const user = await prisma.user.findFirst({ where: id.includes("@") ? { email: id } : { username: id } });
    if (!user || !(await bcrypt.compare(body.password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const role = await syncRole(user);
    res.json({ user: publicUser({ ...user, role }), token: signToken(user) });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ...publicUser(user), createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- email verification

router.post("/verify-email/request", requireAuth, mailLimiter, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new HttpError(404, "User not found");
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    try {
      const r = await issueChallenge(user, "VERIFY_EMAIL");
      res.json({ ok: true, expiresInMinutes: r.expiresInMinutes });
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      console.error("[mail] verification email failed:", e?.message || e);
      throw new HttpError(502, "We couldn't send the email right now. Please try again shortly.", true);
    }
  } catch (err) {
    next(err);
  }
});

const wordSchema = z.object({ word: z.string().trim().min(2).max(80) });

router.post("/verify-email/confirm", requireAuth, wordLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { word } = wordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new HttpError(404, "User not found");
    if (user.emailVerifiedAt) return res.json({ ok: true, user: publicUser(user) });
    if (!normalizeWord(word) || !(await checkChallenge(user.id, "VERIFY_EMAIL", word))) {
      throw new HttpError(400, "That word doesn't match, or it has expired. Check the email or ask for a new word.");
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- password reset

const GENERIC_FORGOT = "If an account uses that email, we've sent it a reset word. It's valid for 20 minutes.";

router.post("/password/forgot", mailLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      try {
        await issueChallenge(user, "RESET_PASSWORD");
      } catch (e: any) {
        // Don't reveal whether the account exists; log the reason.
        console.error("[mail] reset email not sent:", e?.message || e);
      }
    }
    res.json({ ok: true, message: GENERIC_FORGOT });
  } catch (err) {
    next(err);
  }
});

router.post("/password/reset", wordLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        word: z.string().trim().min(2).max(80),
        password: z.string().min(8).max(200),
      })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await checkChallenge(user.id, "RESET_PASSWORD", body.word))) {
      throw new HttpError(400, "Those words don't match, or they have expired. Ask for a new reset email.");
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(body.password, 12),
        // The reset email proves they own the inbox.
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
      },
    });
    const role = await syncRole(updated);
    res.json({ ok: true, user: publicUser({ ...updated, role }), token: signToken(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
