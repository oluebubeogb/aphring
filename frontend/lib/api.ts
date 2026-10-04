/**
 * All API calls go to same origin (/api/...).
 * Next.js rewrites proxy them to the backend container.
 * No localhost, no public API URL required in the browser.
 */
function getApiUrl(): string {
  // Same-origin — works on any domain Coolify assigns
  return "";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aphring_token");
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    (headers as any)["Content-Type"] = "application/json";
  }

  if (token) {
    (headers as any)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

export function setToken(token: string) {
  localStorage.setItem("aphring_token", token);
}

export function clearToken() {
  localStorage.removeItem("aphring_token");
}

export function isLoggedIn() {
  return !!getToken();
}
