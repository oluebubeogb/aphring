"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, Search, Upload, Mic, Trophy, Rss, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import { IconBubble, TONES, type Tone } from "@/components/Colorful";
import { WithPinRail } from "@/components/PinRail";

/** Example questions that slowly rotate in the search box until the visitor starts typing. */
const EXAMPLES = [
  "Who served as deputy chairman of Arochukwu LGA in 2005?",
  "When was Chinua Achebe International Airport opened?",
  "What is the history of the Ooni of Ife?",
  "Which schools did Nnamdi Azikiwe attend?",
  "What does the New Yam Festival celebrate in Igboland?",
  "Who founded the Kano Durbar tradition?",
  "When was Government College Umuahia established?",
  "What happened at the Aba Women's Riot of 1929?",
];
const ROTATE_MS = 4000;
const FADE_MS = 450;

export default function LandingPage() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const router = useRouter();

  const paused = focused || query.length > 0;

  useEffect(() => {
    if (paused) return;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIdx((i) => (i + 1) % EXAMPLES.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(t);
      if (fadeTimer) clearTimeout(fadeTimer);
      setVisible(true);
    };
  }, [paused]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
  };

  const tiles: { icon: typeof Compass; label: string; href: string; note: string; tone: Tone }[] = [
    { icon: Compass, label: "Explore", href: "/explore", note: "People, places, schools and events from verified records", tone: "emerald" },
    { icon: Rss, label: "Feed", href: "/feed", note: "Newly verified records to vote on, save and share", tone: "sky" },
    { icon: Upload, label: "Contribute", href: "/submit", note: "Upload a document or write a record", tone: "orange" },
    { icon: Mic, label: "Oral history", href: "/oral", note: "Upload a recording or transcript", tone: "fuchsia" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard", note: "Top contributors by verified work", tone: "amber" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 w-full">
      <WithPinRail>
      <main className="relative w-full min-h-[calc(100vh-11rem)] flex flex-col items-center justify-center py-16 sm:py-20">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-3 animate-fade-up">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-primary">
              Ask{" "}
              <span className="text-primary">
                Aphring
              </span>
            </h1>
            <p className="text-lg text-secondary">Nigeria&apos;s community knowledge network. Answers come only from verified records.</p>
          </div>
          <form onSubmit={handleSearch} className="relative group animate-fade-up [animation-delay:120ms]">
            <div
              aria-hidden="true"
              className="absolute -inset-0.5 rounded-2xl bg-slate-400 opacity-10 blur-md transition-opacity duration-500 group-hover:opacity-20 group-focus-within:opacity-25"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
              <IconBubble icon={Search} tone="violet" size="md" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Ask Aphring a question"
              placeholder={paused ? EXAMPLES[idx] : ""}
              className="relative w-full h-14 pl-14 pr-14 rounded-xl border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition"
            />
            {!query && !focused && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-14 right-14 top-1/2 -translate-y-1/2 z-10 text-left text-secondary truncate rotating-placeholder ${
                  visible ? "is-visible" : ""
                }`}
              >
                {EXAMPLES[idx]}
              </span>
            )}
            <button
              type="submit"
              aria-label="Ask"
              disabled={!query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 inline-flex items-center justify-center rounded-lg bg-accent text-background transition hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6">
            {tiles.map(({ icon, label, href, note, tone }, i) => (
              <Link
                key={label}
                href={href}
                title={note}
                style={{ animationDelay: `${200 + i * 80}ms` }}
                className={`home-tile group animate-fade-up flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface/70 ${TONES[tone].hoverBorder}`}
              >
                <IconBubble icon={icon} tone={tone} size="lg" className="transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
                <span className="text-sm text-secondary group-hover:text-primary transition-colors">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
      </WithPinRail>
      </div>
      <footer className="border-t border-border py-6 text-center text-sm text-secondary">aphring · Community-powered knowledge for Nigeria</footer>
    </div>
  );
}
