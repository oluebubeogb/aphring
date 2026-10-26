"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { api, clearSession, getStoredUser, isLoggedIn, isStaff, storeUser, type SessionUser } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setUser(isLoggedIn() ? getStoredUser() : null);
    sync();
    setReady(true);
    window.addEventListener("aphring-session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aphring-session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { user, ready };
}

export default function Header() {
  const { theme, toggle } = useTheme();
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Refresh the role from the server once per page load (role changes, env admin grants).
  useEffect(() => {
    if (!isLoggedIn()) return;
    api<SessionUser>("/api/auth/me")
      .then((me) => storeUser(me))
      .catch(() => {});
  }, []);

  const links = [
    { href: "/explore", label: "Explore" },
    { href: "/feed", label: "Feed" },
    { href: "/chat", label: "Ask" },
    { href: "/submit", label: "Contribute" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];
  if (isStaff(user)) links.push({ href: "/workstation", label: "Workstation" });

  const linkCls = (href: string) =>
    `hover:text-primary transition ${pathname?.startsWith(href) ? "text-primary font-medium" : ""}`;

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          aphring
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-secondary">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls(l.href)}>
              {l.label}
            </Link>
          ))}
          <button onClick={toggle} className="hover:text-primary transition" aria-label="Toggle theme">
            {theme === "light" ? "Dark" : "Light"}
          </button>
          {user ? (
            <>
              <Link href="/me" className={linkCls("/me")}>
                @{user.username}
              </Link>
              <button
                onClick={() => {
                  clearSession();
                  router.push("/");
                }}
                className="hover:text-primary transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-md bg-accent text-background text-sm font-medium hover:opacity-90 transition"
            >
              Sign in
            </Link>
          )}
        </nav>
        <button className="md:hidden text-secondary" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border px-4 py-3 flex flex-col gap-3 text-sm text-secondary">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={linkCls(l.href)}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/me" onClick={() => setOpen(false)}>
                @{user.username}
              </Link>
              <button
                className="text-left"
                onClick={() => {
                  clearSession();
                  setOpen(false);
                  router.push("/");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          )}
          <button onClick={toggle} className="text-left">
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      )}
      {user && user.emailVerified === false && (
        <div className="border-t border-border bg-surface text-xs text-secondary">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-1.5">
            Please confirm your email —{" "}
            <Link href="/verify-email" className="underline text-primary">
              enter your word
            </Link>
            .
          </div>
        </div>
      )}
    </header>
  );
}
