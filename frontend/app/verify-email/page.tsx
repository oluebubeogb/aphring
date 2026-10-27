"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser, isLoggedIn, storeUser, type SessionUser } from "@/lib/api";
import { btnGhost, btnPrimary, inputCls, Notice } from "@/components/ui";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login?next=/verify-email");
      return;
    }
    const u = getStoredUser();
    setUser(u);
    if (u?.emailVerified) setDone(true);
  }, []);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      // Any capitalisation works: "Ikenna", "ikenna" and "IKENNA" are the same word.
      const res = await api<{ ok: boolean; user: SessionUser }>("/api/auth/verify-email/confirm", {
        method: "POST",
        body: JSON.stringify({ word: word.trim() }),
      });
      storeUser(res.user);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "That word didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; alreadyVerified?: boolean; expiresInMinutes?: number }>("/api/auth/verify-email/request", {
        method: "POST",
      });
      if (res.alreadyVerified) setDone(true);
      else setInfo(`A new word is on its way. It's valid for ${res.expiresInMinutes ?? 30} minutes.`);
    } catch (err: any) {
      setError(err.message || "Couldn't send a new word.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 sm:py-24 md:py-32">
      <div className="w-full max-w-sm space-y-10">
        <div className="text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            aphring
          </Link>
          <p className="mt-2 text-secondary text-sm">
            {done ? "Your email is confirmed." : "Confirm your email"}
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <Notice kind="ok">All set{user ? `, ${user.name || user.username}` : ""}. Thanks for confirming.</Notice>
            <Link href="/explore" className={`${btnPrimary} w-full h-11`}>
              Continue to Explore
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={confirm} className="space-y-4">
              <p className="text-sm text-secondary">
                We sent a single word to {user?.email ? <strong className="text-primary">{user.email}</strong> : "your email"} — a
                Nigerian name, place or food, like <em>kaduna</em> or <em>ikenna</em>. Type it below; capitals don&apos;t matter.
              </p>
              {error && <Notice kind="error">{error}</Notice>}
              {info && <Notice kind="ok">{info}</Notice>}
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="your word"
                autoFocus
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                required
                className={`${inputCls} text-center text-lg tracking-wide lowercase`}
              />
              <button type="submit" disabled={busy || !word.trim()} className={`${btnPrimary} w-full h-11`}>
                {busy ? "Checking…" : "Confirm email"}
              </button>
            </form>
            <div className="flex items-center justify-between text-sm">
              <button onClick={resend} disabled={busy} className={btnGhost}>
                Send a new word
              </button>
              <Link href="/explore" className="text-secondary hover:text-primary">
                Do this later
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
