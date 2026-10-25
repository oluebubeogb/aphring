import { Award } from "lucide-react";

export interface Badge {
  id: string;
  name: string;
  description: string;
}
export interface Milestone {
  key: string;
  label: string;
  value: number;
  next: number | null;
  nextBadge: string | null;
  progress: number;
}
export interface Stats {
  verifiedRecords: number;
  verifiedWords: number;
  verifiedFiles: number;
  upvotesReceived: number;
  acceptedCorrections: number;
  reviewsDone: number;
}

export function StatsGrid({ stats }: { stats: Stats }) {
  const items = [
    ["Verified records", stats.verifiedRecords],
    ["Verified words", stats.verifiedWords],
    ["Verified files", stats.verifiedFiles],
    ["Upvotes received", stats.upvotesReceived],
    ["Accepted corrections", stats.acceptedCorrections],
    ["Reviews done", stats.reviewsDone],
  ] as const;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(([label, v]) => (
        <div key={label} className="p-3 rounded-xl border border-border bg-surface">
          <p className="text-2xl font-semibold">{v.toLocaleString()}</p>
          <p className="text-xs text-secondary">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function BadgeList({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <p className="text-sm text-secondary">No badges yet. Your first verified record earns one.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span key={b.id} title={b.description} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-surface text-sm">
          <Award className="w-3.5 h-3.5 text-amber-500" /> {b.name}
        </span>
      ))}
    </div>
  );
}

export function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-3">
      {milestones.map((m) => (
        <div key={m.key}>
          <div className="flex justify-between text-sm mb-1">
            <span>{m.label}</span>
            <span className="text-secondary">
              {m.value.toLocaleString()}
              {m.next ? ` / ${m.next.toLocaleString()} → ${m.nextBadge}` : " · all reached"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface border border-border overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${Math.round(m.progress * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
