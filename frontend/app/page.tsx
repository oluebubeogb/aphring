"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, BookOpen, Users, Upload, Archive } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function LandingPage() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    // Start a new chat with the question
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg tracking-tight">
            aphring
          </Link>
          <nav className="flex items-center gap-6 text-sm text-secondary">
            <Link href="/explore" className="hover:text-primary transition">
              Explore
            </Link>
            <Link href="/submit" className="hover:text-primary transition">
              Contribute
            </Link>
            <Link href="/chat" className="hover:text-primary transition">
              Chat
            </Link>
            <button
              onClick={toggle}
              className="text-secondary hover:text-primary transition"
              aria-label="Toggle theme"
            >
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-md bg-accent text-background text-sm font-medium hover:opacity-90 transition"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <div className="max-w-2xl w-full text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-primary">
              Ask Aphring
            </h1>
            <p className="text-lg text-secondary">
              Nigeria&apos;s Community Knowledge Network
            </p>
          </div>

          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Who served as deputy chairman of Arochukwu LGA in 2005?"
              className="w-full h-14 pl-12 pr-4 rounded-xl border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
            />
          </form>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8">
            {[
              { icon: Search, label: "Ask Questions", href: "/chat" },
              { icon: Users, label: "Explore Communities", href: "/explore" },
              { icon: Upload, label: "Contribute Knowledge", href: "/submit" },
              { icon: Archive, label: "Browse Archives", href: "/explore" },
            ].map(({ icon: Icon, label, href }) => (
              <Link
                key={label}
                href={href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:border-accent/30 transition"
              >
                <Icon className="w-5 h-5 text-secondary" />
                <span className="text-sm text-secondary">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-secondary">
        aphring · Community-powered knowledge for Nigeria
      </footer>
    </div>
  );
}
