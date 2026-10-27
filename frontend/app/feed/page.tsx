"use client";

import { useEffect, useState } from "react";
import Header, { useSession } from "@/components/Header";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { api } from "@/lib/api";
import { Clock, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { btnGhost, Notice, Page, Tabs } from "@/components/ui";
import EmptyContribute from "@/components/EmptyContribute";
import type { Tone } from "@/components/Colorful";
import { WithPinRail } from "@/components/PinRail";

type Tab = "recent" | "top" | "foryou";

export default function FeedPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("recent");
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load(t: Tab, p: number) {
    try {
      const res = await api<{ tab: Tab; records: PublicRecord[] }>(`/api/feed?tab=${t}&page=${p}`);
      setNote(t === "foryou" && res.tab !== "foryou" ? "Not enough activity to personalise yet, showing top records." : "");
      setRecords((r) => (p === 1 ? res.records : [...r, ...res.records]));
      setMore(res.records.length >= 15);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setPage(1);
    load(tab, 1);
  }, [tab]);

  const tabs: { value: Tab; label: string; icon: LucideIcon; tone: Tone }[] = [
    { value: "recent", label: "Recent", icon: Clock, tone: "sky" },
    { value: "top", label: "Top", icon: TrendingUp, tone: "emerald" },
  ];
  if (user) tabs.push({ value: "foryou", label: "For you", icon: Sparkles, tone: "violet" });

  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail>
      <Page fill>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Feed</h1>
        <p className="text-secondary text-sm mb-6">Verified records. Vote, save, share or propose a correction.</p>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="space-y-3 mt-6">
          {note && <Notice>{note}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
          {records.map((r) => (
            <RecordCard key={`${tab}-${r.id}`} record={r} />
          ))}
          {records.length === 0 && !error && (
            <EmptyContribute title="No verified records in this feed yet" detail="Be the first to add knowledge the community can verify — it will show up here once approved." />
          )}
          {more && records.length > 0 && (
            <button
              className={btnGhost}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                load(tab, p);
              }}
            >
              Load more
            </button>
          )}
        </div>
      </Page>
      </WithPinRail>
    </div>
  );
}
