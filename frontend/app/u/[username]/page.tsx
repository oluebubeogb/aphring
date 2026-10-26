"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { BadgeList, MilestoneList, StatsGrid, type Badge, type Milestone, type Stats } from "@/components/Badges";
import { api, timeAgo } from "@/lib/api";
import { Notice, Page } from "@/components/ui";

interface PublicProfile {
  user: { username: string; name: string; reputation: number; createdAt: string };
  stats: Stats;
  badges: Badge[];
  milestones: Milestone[];
  recent: { id: string; title: string; type: string; placeText: string | null; upvotes: number; verifiedAt: string }[];
}

export default function UserPage() {
  const { username } = useParams<{ username: string }>();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<PublicProfile>(`/api/users/${username}`)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [username]);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page>
        {error && <Notice>{error}</Notice>}
        {p && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{p.user.name}</h1>
              <p className="text-secondary text-sm">
                @{p.user.username} · reputation {p.user.reputation} · joined {timeAgo(p.user.createdAt)}
              </p>
            </div>
            <StatsGrid stats={p.stats} />
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Badges</h2>
              <BadgeList badges={p.badges} />
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Milestones</h2>
              <MilestoneList milestones={p.milestones} />
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Recently verified</h2>
              {p.recent.length === 0 && <p className="text-sm text-secondary">No verified records yet.</p>}
              <ul className="divide-y divide-border border border-border rounded-xl bg-surface">
                {p.recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/record/${r.id}`} className="flex justify-between gap-3 px-4 py-3 hover:bg-background">
                      <span className="truncate">{r.title}</span>
                      <span className="text-xs text-secondary shrink-0">
                        ▲ {r.upvotes} · {timeAgo(r.verifiedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Page>
    </div>
  );
}
