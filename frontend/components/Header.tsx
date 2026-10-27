"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, LayoutDashboard, LogIn, LogOut, Menu, MessageSquare, Moon, Rss, Sun, Trophy, Upload, User, X, type LucideIcon } from "lucide-react";
import { IconBubble, TONES, type Tone } from "@/components/Colorful";
import { api, clearSession, getStoredUser, isLoggedIn, isStaff, storeUser, type SessionUser } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { appShell, BrandMark } from "@/components/ui";

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

  const links: { href: string; label: string; icon: LucideIcon; tone: Tone }[] = [
    { href: "/explore", label: "Explore", icon: Compass, tone: "emerald" },
    { href: "/feed", label: "Feed", icon: Rss, tone: "sky" },
    { href: "/chat", label: "Ask", icon: MessageSquare, tone: "violet" },
    { href: "/submit", label: "Contribute", icon: Upload, tone: "orange" },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy, tone: "amber" },
  ];
  if (isStaff(user)) links.push({ href: "/workstation", label: "Workstation", icon: LayoutDashboard, tone: "slate" });

  const isActive = (href: string) => Boolean(pathname?.startsWith(href));
  const linkCls = (href: string, tone: Tone) =>
    `nav-link group ${isActive(href) ? `${TONES[tone].text} font-medium` : "text-secondary hover:text-primary"}`;
  const ThemeIcon = theme === "light" ? Moon : Sun;
  const signOut = () => {
    clearSession();
    setOpen(false);
    router.push("/");
  };

  return (
    <header className="border-b border-border bg-background/70 backdrop-blur sticky top-0 z-20">
      <div className="h-px w-full bg-slate-300/40 dark:bg-white/5" aria-hidden="true" />
      <div className={`${appShell} h-14 flex items-center justify-between gap-4`}>
        <Link href="/" className="group inline-flex items-center gap-2 font-semibold text-lg tracking-tight">
          <BrandMark />
          <span className="text-primary">
            aphring
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 lg:gap-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} title={l.label} className={linkCls(l.href, l.tone)} aria-current={isActive(l.href) ? "page" : undefined}>
              <IconBubble icon={l.icon} tone={l.tone} size="sm" active={isActive(l.href)} className="nav-bubble" />
              <span className="hidden lg:inline">{l.label}</span>
              <span className="lg:hidden sr-only">{l.label}</span>
            </Link>
          ))}
          <button onClick={toggle} className="nav-link group text-secondary hover:text-primary" aria-label="Toggle theme" title={theme === "light" ? "Dark mode" : "Light mode"}>
            <IconBubble icon={ThemeIcon} tone={theme === "light" ? "indigo" : "yellow"} size="sm" className="nav-bubble group-hover:rotate-12" />
          </button>
          {user ? (
            <>
              <Link href="/me" className={linkCls("/me", "teal")} title="My profile">
                <IconBubble icon={User} tone="teal" size="sm" active={isActive("/me")} className="nav-bubble" />
                <span className="max-w-[9rem] truncate">@{user.username}</span>
              </Link>
              <button onClick={signOut} className="nav-link group text-secondary hover:text-primary" title="Sign out" aria-label="Sign out">
                <IconBubble icon={LogOut} tone="rose" size="sm" className="nav-bubble" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-background text-sm font-medium hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md transition"
            >
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          )}
        </nav>
        <button className="md:hidden text-secondary hover:text-primary transition" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className={`md:hidden border-t border-border ${appShell} py-3 flex flex-col gap-1 text-sm animate-slide-down`}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`mobile-link ${linkCls(l.href, l.tone)}`}>
              <IconBubble icon={l.icon} tone={l.tone} size="sm" active={isActive(l.href)} className="nav-bubble" />
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/me" onClick={() => setOpen(false)} className={`mobile-link ${linkCls("/me", "teal")}`}>
                <IconBubble icon={User} tone="teal" size="sm" active={isActive("/me")} className="nav-bubble" />
                @{user.username}
              </Link>
              <button className="mobile-link nav-link group text-left text-secondary hover:text-primary" onClick={signOut}>
                <IconBubble icon={LogOut} tone="rose" size="sm" className="nav-bubble" />
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="mobile-link nav-link group text-secondary hover:text-primary">
              <IconBubble icon={LogIn} tone="blue" size="sm" className="nav-bubble" />
              Sign in
            </Link>
          )}
          <button onClick={toggle} className="mobile-link nav-link group text-left text-secondary hover:text-primary">
            <IconBubble icon={ThemeIcon} tone={theme === "light" ? "indigo" : "yellow"} size="sm" className="nav-bubble group-hover:rotate-12" />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      )}
      {user && user.emailVerified === false && (
        <div className="border-t border-border bg-surface text-xs text-secondary">
          <div className={`${appShell} py-1.5`}>
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
