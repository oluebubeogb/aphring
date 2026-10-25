import { prisma } from "./prisma.js";
import { isEnvAdmin } from "../config.js";

type Role = "USER" | "MODERATOR" | "ADMIN";

/**
 * ADMIN comes only from ADMIN_USERNAMES.
 * - listed  -> ADMIN
 * - was ADMIN but no longer listed -> demoted to USER
 * MODERATOR is granted through invites and is left untouched.
 */
export async function syncRole(user: { id: string; username: string; role: Role }): Promise<Role> {
  const shouldBeAdmin = isEnvAdmin(user.username);
  let next: Role = user.role;
  if (shouldBeAdmin) next = "ADMIN";
  else if (user.role === "ADMIN") next = "USER";
  if (next !== user.role) {
    await prisma.user.update({ where: { id: user.id }, data: { role: next } });
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: next === "ADMIN" ? "role.env_admin_granted" : "role.env_admin_removed",
        target: user.id,
        detail: { username: user.username, from: user.role, to: next },
      },
    });
  }
  return next;
}

export async function audit(actorId: string | null, action: string, target?: string, detail?: any) {
  await prisma.auditLog.create({ data: { actorId, action, target, detail } });
}
