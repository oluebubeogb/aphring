"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setSession, type SessionUser } from "@/lib/api";
import { btnPrimary, inputCls, Notice } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...form, username: form.username.toLowerCase() }),
      });
      setSession(res.token, res.user);
      router.push("/explore");
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
          <p className="mt-2 text-secondary text-sm">Create your contributor account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <div>
            <label className="block text-sm text-secondary mb-1.5">Full name</label>
            <input value={form.name} onChange={set("name")} required minLength={2} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Username</label>
            <input
              value={form.username}
              onChange={set("username")}
              required
              pattern="[A-Za-z0-9_]{3,30}"
              title="3–30 letters, numbers or underscores"
              autoComplete="username"
              className={inputCls}
            />
            <p className="text-xs text-secondary mt-1">Shown publicly on your records and the leaderboard. 3–30 letters, numbers or _.</p>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={set("email")} required className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Password</label>
            <input type="password" value={form.password} onChange={set("password")} required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <button type="submit" disabled={loading} className={`${btnPrimary} w-full h-11`}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-secondary">
          Have an account?{" "}
          <Link href="/login" className="text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
