"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { Notice, Page, Tabs } from "@/components/ui";

interface Row {
  id: string;
  username: string;
  name: string;
  role: string;
  records: number;
  words: number;
  ups: number;
  score: number;
}

function Table({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-secondary">No verified work in this period yet.</p>;
  return (
    <div className="overflow-x-auto border border-border rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-surface text-secondary text-left">
          <tr>
            <th className="px-3 py-2 w-10">#</th>
            <th className="px-3 py-2">Contributor</th>
            <th className="px-3 py-2 text-right">Records</th>
            <th className="px-3 py-2 text-right">Words</th>
            <th className="px-3 py-2 text-right">Upvotes</th>
            <th className="px-3 py-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2 text-secondary">{i + 1}</td>
              <td className="px-3 py-2">
                <Link href={`/u/${r.username}`} className="hover:underline">
                  {r.name} <span className="text-secondary">@{r.username}</span>
                </Link>
              </td>
              <td className="px-3 py-2 text-right">{r.records}</td>
              <td className="px-3 py-2 text-right">{r.words.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{r.ups}</td>
              <td className="px-3 py-2 text-right font-medium">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<"all" | "month">("all");
  const [data, setData] = useState<{ contributors: Row[]; staff: Row[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/leaderboard?period=${period}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [period]);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Leaderboard</h1>
        <p className="text-secondary text-sm mb-6">Only verified records count. Score = 5 × verified records + upvotes received.</p>
        <Tabs
          value={period}
          onChange={setPeriod}
          tabs={[
            { value: "all", label: "All time" },
            { value: "month", label: "Last 30 days" },
          ]}
        />
        <div className="mt-6 space-y-8">
          {error && <Notice kind="error">{error}</Notice>}
          {data && (
            <>
              <Table rows={data.contributors} />
              {data.staff.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Moderators &amp; admins</h2>
                  <Table rows={data.staff} />
                </div>
              )}
            </>
          )}
        </div>
      </Page>
    </div>
  );
}
