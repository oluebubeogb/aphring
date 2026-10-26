"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { btnPrimary, inputCls, Notice } from "@/components/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      router.push(`/reset-password?email=${encodeURIComponent(email.trim())}&sent=1`);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            aphring
          </Link>
          <p className="mt-2 text-secondary text-sm">Reset your password</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-secondary">
            Enter the email on your account. We&apos;ll send you two short words to type on the next screen.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className={inputCls} />
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full h-11`}>
            {busy ? "Sending…" : "Send reset words"}
          </button>
        </form>
        <p className="text-center text-sm text-secondary">
          Remembered it?{" "}
          <Link href="/login" className="text-primary underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
