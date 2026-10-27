"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setSession, type SessionUser } from "@/lib/api";
import { btnPrimary, inputCls, Notice } from "@/components/ui";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sent = params.get("sent") === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; token: string; user: SessionUser }>("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), word: word.trim(), password }),
      });
      setSession(res.token, res.user);
      router.push("/explore");
    } catch (err: any) {
      setError(err.message || "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            aphring
          </Link>
          <p className="mt-2 text-secondary text-sm">Choose a new password</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {sent && (
            <Notice kind="ok">
              If an account uses that email, two words are on their way (for example <em>abuja suya</em>). They&apos;re valid for 20 minutes.
            </Notice>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          <div>
            <label className="block text-sm text-secondary mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Words from the email</label>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              required
              placeholder="two words, any capitals"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              className={`${inputCls} lowercase`}
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Repeat new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full h-11`}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
        <p className="text-center text-sm text-secondary">
          No email?{" "}
          <Link href="/forgot-password" className="text-primary underline underline-offset-2">
            Send new words
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
