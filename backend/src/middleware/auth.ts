import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config.js";
import { prisma } from "../services/prisma.js";
import { syncRole } from "../services/roles.js";

export interface AuthUser {
  id: string;
  username: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: { id: string; username: string }) {
  // Role is NOT trusted from the token; it is re-read from the DB on every request.
  return jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), {
    expiresIn: "7d",
  });
}

async function resolveUser(header?: string): Promise<AuthUser | null> {
  if (!header?.startsWith("Bearer ")) return null;
  let payload: { id: string };
  try {
    payload = jwt.verify(header.slice(7), getJwtSecret()) as { id: string };
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, username: true, role: true },
  });
  if (!user) return null;
  const role = await syncRole(user);
  return { id: user.id, username: user.username, role };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req.headers.authorization);
    if (user) req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function isStaff(user?: AuthUser) {
  return !!user && (user.role === "ADMIN" || user.role === "MODERATOR");
}
