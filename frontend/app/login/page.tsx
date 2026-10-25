"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setSession, type SessionUser } from "@/lib/api";
import { btnPrimary, inputCls, Notice } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      setSession(res.token, res.user);
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : "/explore");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            aphring
          </Link>
          <p className="mt-2 text-secondary text-sm">Sign in with your username or email</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <div>
            <label className="block text-sm text-secondary mb-1.5">Username or email</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" disabled={loading} className={`${btnPrimary} w-full h-11`}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-secondary">
          No account?{" "}
          <Link href="/register" className="text-primary underline underline-offset-2">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
