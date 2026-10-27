"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import Header from "@/components/Header";
import EntityTile, { type ExploreEntity } from "@/components/EntityTile";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { api, downloadFile, exploreSeed, timeAgo } from "@/lib/api";
import { Chip, entityHref, inputCls, Notice, Page } from "@/components/ui";
import EmptyContribute from "@/components/EmptyContribute";
import { WithPinRail } from "@/components/PinRail";
import { BadgeCheck, Compass, Heart, type LucideIcon } from "lucide-react";
import { entityTypeStyle, IconBubble, type Tone } from "@/components/Colorful";
import { PageTitle, SectionTitle } from "@/components/ui";

interface ExploreData {
  personalized: boolean;
  rankingNote?: string;
  forYou: ExploreEntity[];
  shelves: { type: string; label: string; total: number; entities: ExploreEntity[] }[];
  documents: { id: string; filename: string; mimeType: string; createdAt: string; verifiedRecords: number }[];
  recent: { id: string; title: string; type: string; placeText: string | null; verifiedAt: string; upvotes: number }[];
}

function Shelf({ title, href, total, children, icon, tone }: { title: string; href?: string; total?: number; children: React.ReactNode; icon: LucideIcon; tone: Tone }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <SectionTitle icon={icon} tone={tone}>{title}</SectionTitle>
        {href && (
          <Link href={href} className="text-sm text-secondary hover:text-primary">
            See all{total ? ` (${total})` : ""} →
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

export default function ExplorePage() {
  const [data, setData] = useState<ExploreData | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ entities: ExploreEntity[]; records: PublicRecord[] } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api<ExploreData>(`/api/explore?seed=${exploreSeed()}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return setResults(null);
    setSearching(true);
    try {
      setResults(await api(`/api/explore/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  const empty = data && data.shelves.length === 0 && data.recent.length === 0;

  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail>
      <Page wide>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <PageTitle icon={Compass} tone="emerald" title="Explore" subtitle="Built from verified records only." />
          <form onSubmit={search} className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, places, schools…" className={`${inputCls} pl-9`} />
          </form>
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        {results && (
          <section className="mb-10 space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle icon={Search} tone="sky">Results for “{q}”</SectionTitle>
              <button className="text-sm text-secondary hover:text-primary" onClick={() => setResults(null)}>
                Clear
              </button>
            </div>
            {searching && <p className="text-sm text-secondary">Searching…</p>}
            {results.entities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {results.entities.map((e) => (
                  <Chip key={e.id} href={entityHref(e)}>
                    {e.name}
                  </Chip>
                ))}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              {results.records.map((r) => (
                <RecordCard key={r.id} record={r} />
              ))}
            </div>
            {results.entities.length === 0 && results.records.length === 0 && (
              <EmptyContribute title="Nothing verified matches that search" detail="Try different words, or contribute what you know so it can be verified and found next time." />
            )}
          </section>
        )}

        {!data && !error && <p className="text-secondary">Loading…</p>}
        {empty && (
          <EmptyContribute
            title="Explore is waiting on the first verified records"
            detail="People, places, schools and events appear here as records are verified. Add what you know to get the shelves started."
          />
        )}

        {data && (
          <div className="space-y-10">
            {data.forYou.length > 0 && (
              <Shelf title="For you" icon={Heart} tone="rose">
                {data.forYou.map((e) => (
                  <EntityTile key={e.id} e={e} />
                ))}
              </Shelf>
            )}
            {data.shelves.map((s) => (
              <Shelf key={s.type} icon={entityTypeStyle(s.type).icon} tone={entityTypeStyle(s.type).tone} title={s.label} href={`/explore/${s.type.toLowerCase()}`} total={s.total}>
                {s.entities.map((e) => (
                  <EntityTile key={e.id} e={e} />
                ))}
              </Shelf>
            ))}
            {data.documents.length > 0 && (
              <Shelf title="Source documents" icon={FileText} tone="sky">
                {data.documents.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => downloadFile(`/api/documents/${d.id}/download`, d.filename).catch((e) => setError(e.message))}
                    className="text-left min-w-[200px] shrink-0 p-4 rounded-xl border border-border bg-surface hover:border-accent/40"
                  >
                    <IconBubble icon={FileText} tone="sky" size="xs" className="mb-2" />
                    <p className="text-sm font-medium truncate">{d.filename}</p>
                  </button>
                ))}
              </Shelf>
            )}
            {data.recent.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <SectionTitle icon={BadgeCheck} tone="emerald">Recently verified</SectionTitle>
                  <Link href="/feed" className="text-sm text-secondary hover:text-primary">
                    Open feed →
                  </Link>
                </div>
                <ul className="divide-y divide-border border border-border rounded-xl bg-surface">
                  {data.recent.map((r) => (
                    <li key={r.id}>
                      <Link href={`/record/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background">
                        <span className="truncate">{r.title}</span>
                        <span className="text-xs text-secondary shrink-0">
                          {r.placeText ? `${r.placeText} · ` : ""}
                          {timeAgo(r.verifiedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Page>
      </WithPinRail>
    </div>
  );
}
