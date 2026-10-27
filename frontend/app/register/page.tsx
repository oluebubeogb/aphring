"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setSession, type SessionUser } from "@/lib/api";
import { AuthHeader, FieldLabel, btnPrimary, inputCls, Notice } from "@/components/ui";
import { AtSign, Lock, Mail, User, UserPlus } from "lucide-react";

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
      // A one-word code has been emailed; confirm it next (can be skipped and done later from /verify-email).
      router.push("/verify-email");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 sm:py-24 md:py-32">
      <div className="w-full max-w-sm space-y-10">
        <AuthHeader icon={UserPlus} tone="emerald" subtitle="Create your contributor account" />
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <div>
            <FieldLabel icon={User} tone="teal" className="mb-1.5">Full name</FieldLabel>
            <input value={form.name} onChange={set("name")} required minLength={2} className={inputCls} />
          </div>
          <div>
            <FieldLabel icon={AtSign} tone="sky" className="mb-1.5">Username</FieldLabel>
            <input
              value={form.username}
              onChange={set("username")}
              required
              pattern="[A-Za-z0-9_]{3,30}"
              title="3–30 letters, numbers or underscores"
              autoComplete="username"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel icon={Mail} tone="amber" className="mb-1.5">Email</FieldLabel>
            <input type="email" value={form.email} onChange={set("email")} required className={inputCls} />
          </div>
          <div>
            <FieldLabel icon={Lock} tone="violet" className="mb-1.5">Password</FieldLabel>
            <input type="password" value={form.password} onChange={set("password")} required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
          </div>
          <button type="submit" disabled={loading} className={`${btnPrimary} w-full h-11`}>
            <UserPlus className="w-4 h-4" />
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
