"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Community {
  id: string;
  name: string;
  slug: string;
  lga: string | null;
  state: string;
  _count: { knowledgeRecords: number };
}

export default function ExplorePage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Community[]>("/api/communities")
      .then(setCommunities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">
            aphring
          </Link>
          <nav className="flex gap-6 text-sm text-secondary">
            <Link href="/chat" className="hover:text-primary">Chat</Link>
            <Link href="/submit" className="hover:text-primary">Contribute</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Communities</h1>
        <p className="text-secondary mb-10">
          Explore verified local knowledge across Abia State
        </p>

        {loading ? (
          <p className="text-secondary">Loading…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {communities.map((c) => (
              <Link
                key={c.id}
                href={`/community/${c.slug}`}
                className="block p-5 rounded-xl border border-border bg-surface hover:border-accent/30 transition"
              >
                <h2 className="font-medium text-primary">{c.name}</h2>
                <p className="text-sm text-secondary mt-1">
                  {c.lga ? `${c.lga}, ` : ""}
                  {c.state}
                </p>
                <p className="text-xs text-secondary mt-3">
                  {c._count.knowledgeRecords} records
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
