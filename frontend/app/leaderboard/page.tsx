"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { CalendarDays, Crown, Infinity as InfinityIcon, Medal, Star, Trophy } from "lucide-react";
import { Notice, Page, PageTitle, Tabs } from "@/components/ui";
import { IconBubble, TONES, type Tone } from "@/components/Colorful";
import { WithPinRail } from "@/components/PinRail";

const MILESTONE_TONES: Tone[] = ["emerald", "sky", "violet", "amber", "rose", "teal", "orange", "indigo"];
const RANK_TONES: Tone[] = ["amber", "slate", "orange"];

interface Row {
  username: string;
  name: string;
  milestone: string | null;
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
            <th className="px-3 py-2 hidden sm:table-cell">Milestone</th>
            <th className="px-3 py-2 text-right">Records</th>
            <th className="px-3 py-2 text-right">Words</th>
            <th className="px-3 py-2 text-right">Upvotes</th>
            <th className="px-3 py-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.username} className="border-t border-border transition-colors hover:bg-surface">
              <td className="px-3 py-2 text-secondary">
                {i < 3 ? <IconBubble icon={i === 0 ? Crown : Medal} tone={RANK_TONES[i]} size="xs" className="hover-pop" /> : i + 1}
              </td>
              <td className="px-3 py-2">
                <Link href={`/u/${r.username}`} className="hover:underline">
                  {r.name} <span className="text-secondary">@{r.username}</span>
                </Link>
              </td>
              <td className="px-3 py-2 hidden sm:table-cell text-secondary">
                {r.milestone ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${TONES.amber.soft}`}>
                    <Star className="w-3 h-3" /> {r.milestone}
                  </span>
                ) : (
                  "—"
                )}
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
  const [data, setData] = useState<{ contributors: Row[]; milestones?: { min: number; name: string }[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/leaderboard?period=${period}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [period]);
  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail>
      <Page fill>
        <div className="mb-6">
          <PageTitle icon={Trophy} tone="amber" title="Leaderboard" />
        </div>
        <Tabs
          value={period}
          onChange={setPeriod}
          tabs={[
            { value: "all", label: "All time", icon: InfinityIcon, tone: "violet" },
            { value: "month", label: "Last 30 days", icon: CalendarDays, tone: "sky" },
          ]}
        />
        <div className="mt-6 space-y-8">
          {error && <Notice kind="error">{error}</Notice>}
          {data && <Table rows={data.contributors} />}
          {data?.milestones && (
            <div className="space-y-2">
              <p className="text-xs text-secondary uppercase tracking-wide">Milestones</p>
              <div className="flex flex-wrap gap-2">
                {data.milestones.map((m, i) => {
                  const tone = MILESTONE_TONES[i % MILESTONE_TONES.length];
                  return (
                    <span
                      key={m.name}
                      className={`group inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-xs transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${TONES[tone].soft}`}
                    >
                      <IconBubble icon={Medal} tone={tone} size="xs" className="transition-transform duration-300 group-hover:rotate-12" />
                      {m.name} <span className="opacity-70">({m.min}+ verified)</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Page>
      </WithPinRail>
    </div>
  );
}
