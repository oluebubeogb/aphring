"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthHeader, FieldLabel, btnPrimary, inputCls, Notice } from "@/components/ui";
import { KeyRound, Mail, Send } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center px-6 py-16 sm:py-24 md:py-32">
      <div className="w-full max-w-sm space-y-10">
        <AuthHeader icon={KeyRound} tone="amber" subtitle="Reset your password" />
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-secondary">
            Enter the email on your account. We&apos;ll send you two short words to type on the next screen.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <FieldLabel icon={Mail} tone="sky" className="-mb-2">Email</FieldLabel>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className={inputCls} />
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full h-11`}>
            <Send className="w-4 h-4" />
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
