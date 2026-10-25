"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, Search, Upload, Mic, Trophy, Rss } from "lucide-react";
import Header from "@/components/Header";

export default function LandingPage() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
  };

  const tiles = [
    { icon: Compass, label: "Explore", href: "/explore", note: "People, places, schools and events from verified records" },
    { icon: Rss, label: "Feed", href: "/feed", note: "Newly verified records to vote on, save and share" },
    { icon: Upload, label: "Contribute", href: "/submit", note: "Upload a document or write a record" },
    { icon: Mic, label: "Oral history", href: "/oral", note: "Upload a recording or transcript" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard", note: "Top contributors by verified work" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-primary">Ask Aphring</h1>
            <p className="text-lg text-secondary">Nigeria&apos;s community knowledge network. Answers come only from verified records.</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6">
            {tiles.map(({ icon: Icon, label, href, note }) => (
              <Link
                key={label}
                href={href}
                title={note}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:border-accent/30 transition"
              >
                <Icon className="w-5 h-5 text-secondary" />
                <span className="text-sm text-secondary">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-secondary">aphring · Community-powered knowledge for Nigeria</footer>
    </div>
  );
}
