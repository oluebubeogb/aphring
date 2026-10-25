"use client";

import { useEffect, useState } from "react";
import Header, { useSession } from "@/components/Header";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { api } from "@/lib/api";
import { btnGhost, Notice, Page, Tabs } from "@/components/ui";

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

  const tabs: { value: Tab; label: string }[] = [
    { value: "recent", label: "Recent" },
    { value: "top", label: "Top" },
  ];
  if (user) tabs.push({ value: "foryou", label: "For you" });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Feed</h1>
        <p className="text-secondary text-sm mb-6">Verified records. Vote, save, share or propose a correction.</p>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="space-y-3 mt-6">
          {note && <Notice>{note}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
          {records.map((r) => (
            <RecordCard key={`${tab}-${r.id}`} record={r} />
          ))}
          {records.length === 0 && !error && <p className="text-sm text-secondary">No verified records yet.</p>}
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
    </div>
  );
}
