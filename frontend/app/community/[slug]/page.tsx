"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface Record {
  id: string;
  title: string;
  content: string;
  type: string;
  createdBy: { name: string };
}

interface Community {
  id: string;
  name: string;
  slug: string;
  lga: string | null;
  state: string;
  description: string | null;
  knowledgeRecords: Record[];
}

export default function CommunityPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Community>(`/api/communities/${slug}`)
      .then(setCommunity)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-secondary">
        Loading…
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen flex items-center justify-center text-secondary">
        Community not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">
            aphring
          </Link>
          <Link href="/explore" className="text-sm text-secondary hover:text-primary">
            All communities
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">{community.name}</h1>
          <p className="text-secondary mt-1">
            {community.lga ? `${community.lga}, ` : ""}
            {community.state}, Nigeria
          </p>
          {community.description && (
            <p className="mt-4 text-secondary leading-relaxed">
              {community.description}
            </p>
          )}
        </div>

        <h2 className="text-lg font-medium mb-4">Knowledge Records</h2>

        {community.knowledgeRecords.length === 0 ? (
          <p className="text-secondary text-sm">
            No verified records yet.{" "}
            <Link href="/submit" className="underline underline-offset-2">
              Contribute knowledge
            </Link>
          </p>
        ) : (
          <div className="space-y-6">
            {community.knowledgeRecords.map((r) => (
              <article
                key={r.id}
                className="p-5 rounded-xl border border-border bg-surface"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-wide text-secondary bg-background px-2 py-0.5 rounded">
                    {r.type}
                  </span>
                  <span className="text-xs text-secondary">
                    by {r.createdBy.name}
                  </span>
                </div>
                <h3 className="font-medium text-primary">{r.title}</h3>
                <p className="mt-2 text-sm text-secondary leading-relaxed line-clamp-4">
                  {r.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
