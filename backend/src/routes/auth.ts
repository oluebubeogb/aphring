import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../services/prisma.js";
import { requireAuth, AuthRequest, signToken } from "../middleware/auth.js";
import { syncRole } from "../services/roles.js";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

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

function publicUser(u: { id: string; username: string; name: string; email: string; role: string; avatar: string | null; reputation: number }) {
  return { id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, avatar: u.avatar, reputation: u.reputation };
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
    res.status(201).json({ user: publicUser({ ...user, role }), token: signToken(user) });
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

export default router;
