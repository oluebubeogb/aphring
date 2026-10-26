/**
 * All API calls go to same origin (/api/...). Next.js rewrites proxy them to the backend.
 *
 * NOTE: the JWT is still kept in localStorage (as in the original app). Moving it to an
 * httpOnly cookie is listed as a deferred item in IMPROVEMENTS.md.
 */
export type Role = "USER" | "MODERATOR" | "ADMIN";
export interface SessionUser {
  id: string;
  username: string;
  name: string | null;
  email?: string;
  role: Role;
  reputation: number;
  /** false until the user confirms their email word (absent on very old sessions). */
  emailVerified?: boolean;
}

const TOKEN_KEY = "aphring_token";
const USER_KEY = "aphring_user";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...((options.headers as Record<string, string>) || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    if (res.status === 401 && token) clearSession();
    const gatewayTimeout = res.status === 502 || res.status === 504 || res.status === 408;
    const msg =
      err.error ||
      (Array.isArray(err.details) ? err.details.map((d: any) => d.message).join(", ") : "") ||
      (gatewayTimeout
        ? "The AI took too long on the gateway. Wait a minute and ask again."
        : res.statusText || "Request failed");
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

/** Download a file through the API (keeps the auth header) and save it in the browser. */
export async function downloadFile(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error || "Download failed", res.status);
  }
  const disp = res.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("aphring-session"));
}

/** Back-compat helper used by older pages. */
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("aphring-session"));
}
export const clearToken = clearSession;

export function isLoggedIn() {
  return !!getToken();
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("aphring-session"));
}

export function isStaff(user: SessionUser | null) {
  return !!user && (user.role === "ADMIN" || user.role === "MODERATOR");
}

/** Stable per-browser seed so Explore ordering differs between visitors but stays steady for one. */
export function exploreSeed(): string {
  if (typeof window === "undefined") return "server";
  let s = localStorage.getItem("aphring_seed");
  if (!s) {
    s = Math.random().toString(36).slice(2, 12);
    localStorage.setItem("aphring_seed", s);
  }
  return s;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return "just now";
}

export const KNOWLEDGE_TYPES = ["history", "politics", "traditional", "education", "culture", "government", "person", "event"] as const;

export const ENTITY_TYPES = [
  "PERSON",
  "PLACE",
  "INSTITUTION",
  "ORGANIZATION",
  "EVENT",
  "TOPIC",
] as const;
