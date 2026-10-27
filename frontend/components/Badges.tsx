import { Award, BadgeCheck, Flag, History, CheckCircle2, ClipboardCheck, FileText, FolderOpen, PencilLine, ThumbsUp, type LucideIcon } from "lucide-react";
import { IconBubble, TONES, type Tone } from "@/components/Colorful";

/** Colour + icon per milestone ladder / stat (keys match the backend's badge ladders). */
export const MILESTONE_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  verifiedRecords: { icon: CheckCircle2, tone: "emerald" },
  verifiedWords: { icon: FileText, tone: "sky" },
  verifiedFiles: { icon: FolderOpen, tone: "violet" },
  upvotesReceived: { icon: ThumbsUp, tone: "amber" },
  acceptedCorrections: { icon: PencilLine, tone: "rose" },
  reviewsDone: { icon: ClipboardCheck, tone: "teal" },
};
const milestoneStyle = (key: string) => MILESTONE_STYLE[key] || { icon: Award, tone: "gray" as Tone };

/** Badge pills cycle through warm-to-cool tones so a row of them looks lively. */
const BADGE_TONES: Tone[] = ["amber", "emerald", "sky", "violet", "rose", "teal", "orange", "indigo"];
function badgeTone(id: string): Tone {
  const ladder = id.split("-")[0];
  if (MILESTONE_STYLE[ladder]) return MILESTONE_STYLE[ladder].tone;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BADGE_TONES[h % BADGE_TONES.length];
}

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
  /** Only present on your own profile (/api/me) — hidden publicly. */
  reviewsDone?: number;
}

export function StatsGrid({ stats }: { stats: Stats }) {
  const items: [string, number, string][] = [
    ["Verified records", stats.verifiedRecords, "verifiedRecords"],
    ["Verified words", stats.verifiedWords, "verifiedWords"],
    ["Verified files", stats.verifiedFiles, "verifiedFiles"],
    ["Upvotes received", stats.upvotesReceived, "upvotesReceived"],
    ["Accepted corrections", stats.acceptedCorrections, "acceptedCorrections"],
  ];
  if (typeof stats.reviewsDone === "number") items.push(["Reviews done", stats.reviewsDone, "reviewsDone"]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(([label, v, key]) => {
        const st = milestoneStyle(key);
        return (
          <div key={label} className={`card-lift group p-3 rounded-xl border border-border bg-surface flex items-start gap-3 ${TONES[st.tone].hoverBorder}`}>
            <IconBubble icon={st.icon} tone={st.tone} size="md" className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <div className="min-w-0">
              <p className="text-2xl font-semibold leading-tight">{v.toLocaleString()}</p>
              <p className="text-xs text-secondary">{label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BadgeList({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <p className="text-sm text-secondary">No badges yet. Your first verified record earns one.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span
          key={b.id}
          title={b.description}
          className={`group inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${TONES[badgeTone(b.id)].soft}`}
        >
          <IconBubble icon={Award} tone={badgeTone(b.id)} size="xs" className="transition-transform duration-300 group-hover:rotate-12" /> {b.name}
        </span>
      ))}
    </div>
  );
}

export function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-3">
      {milestones.map((m) => {
        const st = milestoneStyle(m.key);
        return (
        <div key={m.key} className="group">
          <div className="flex justify-between items-center gap-2 text-sm mb-1">
            <span className="inline-flex items-center gap-2">
              <IconBubble icon={st.icon} tone={st.tone} size="xs" className="transition-transform duration-200 group-hover:scale-110" />
              {m.label}
            </span>
            <span className="text-secondary">
              {m.value.toLocaleString()}
              {m.next ? ` / ${m.next.toLocaleString()} → ${m.nextBadge}` : " · all reached"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-border overflow-hidden">
            <div className="h-full rounded-full progress-grow bg-zinc-400 dark:bg-zinc-500" style={{ width: `${Math.round(m.progress * 100)}%` }} />
          </div>
        </div>
        );
      })}
    </div>
  );
}

/** Section heading with a calm gray icon (profile pages). */
export function SectionHeading({ icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold inline-flex items-center gap-2">
      <IconBubble icon={icon} tone="gray" size="sm" />
      {children}
    </h2>
  );
}

export const SECTION_ICONS = { badges: BadgeCheck, milestones: Flag, recent: History, work: CheckCircle2 } as const;
