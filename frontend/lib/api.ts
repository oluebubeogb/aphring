function getApiUrl(): string {
  if (typeof window !== "undefined") {
    // Runtime override injected by layout (works with Coolify env without rebuild)
    const runtime = (window as any).__APHRING_API_URL__;
    if (runtime && typeof runtime === "string" && runtime.length > 0) {
      return runtime.replace(/\/$/, "");
    }
  }
  const fromEnv = process.env.NEXT_PUBLIC_API_URL || "";
  return fromEnv.replace(/\/$/, "") || "http://localhost:4000";
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

  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, {
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
