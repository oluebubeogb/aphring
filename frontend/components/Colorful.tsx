"use client";

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  Flame,
  GraduationCap,
  Hash,
  Landmark,
  MapPin,
  Palette,
  Scale,
  User,
  Users,
} from "lucide-react";

/**
 * Shared colour tones so icons stay consistent across Aphring.
 * Every class is written out in full so Tailwind keeps it in the build.
 */
export type Tone =
  | "emerald"
  | "sky"
  | "violet"
  | "amber"
  | "yellow"
  | "slate"
  | "rose"
  | "teal"
  | "orange"
  | "indigo"
  | "fuchsia"
  | "blue"
  | "green"
  | "gray";

export const TONES: Record<Tone, { bubble: string; text: string; bar: string; ring: string; soft: string; hoverBorder: string }> = {
  emerald: {
    bubble: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-300",
    bar: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    ring: "ring-emerald-400/60",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25",
    hoverBorder: "hover:border-emerald-300 dark:hover:border-emerald-500/40",
  },
  sky: {
    bubble: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    text: "text-sky-600 dark:text-sky-300",
    bar: "bg-gradient-to-r from-sky-400 to-sky-600",
    ring: "ring-sky-400/60",
    soft: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25",
    hoverBorder: "hover:border-sky-300 dark:hover:border-sky-500/40",
  },
  violet: {
    bubble: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    text: "text-violet-600 dark:text-violet-300",
    bar: "bg-gradient-to-r from-violet-400 to-violet-600",
    ring: "ring-violet-400/60",
    soft: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/25",
    hoverBorder: "hover:border-violet-300 dark:hover:border-violet-500/40",
  },
  amber: {
    bubble: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-300",
    bar: "bg-gradient-to-r from-amber-300 to-amber-500",
    ring: "ring-amber-400/60",
    soft: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25",
    hoverBorder: "hover:border-amber-300 dark:hover:border-amber-500/40",
  },
  yellow: {
    bubble: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300",
    text: "text-yellow-600 dark:text-yellow-300",
    bar: "bg-gradient-to-r from-yellow-300 to-yellow-500",
    ring: "ring-yellow-400/60",
    soft: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:border-yellow-500/25",
    hoverBorder: "hover:border-yellow-300 dark:hover:border-yellow-500/40",
  },
  slate: {
    bubble: "bg-slate-200 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
    text: "text-slate-600 dark:text-slate-300",
    bar: "bg-gradient-to-r from-slate-400 to-slate-600",
    ring: "ring-slate-400/60",
    soft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-400/10 dark:text-slate-300 dark:border-slate-400/25",
    hoverBorder: "hover:border-slate-300 dark:hover:border-slate-400/40",
  },
  rose: {
    bubble: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-300",
    bar: "bg-gradient-to-r from-rose-400 to-rose-600",
    ring: "ring-rose-400/60",
    soft: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25",
    hoverBorder: "hover:border-rose-300 dark:hover:border-rose-500/40",
  },
  teal: {
    bubble: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
    text: "text-teal-600 dark:text-teal-300",
    bar: "bg-gradient-to-r from-teal-400 to-teal-600",
    ring: "ring-teal-400/60",
    soft: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25",
    hoverBorder: "hover:border-teal-300 dark:hover:border-teal-500/40",
  },
  orange: {
    bubble: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
    text: "text-orange-600 dark:text-orange-300",
    bar: "bg-gradient-to-r from-orange-400 to-orange-600",
    ring: "ring-orange-400/60",
    soft: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/25",
    hoverBorder: "hover:border-orange-300 dark:hover:border-orange-500/40",
  },
  indigo: {
    bubble: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    text: "text-indigo-600 dark:text-indigo-300",
    bar: "bg-gradient-to-r from-indigo-400 to-indigo-600",
    ring: "ring-indigo-400/60",
    soft: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/25",
    hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-500/40",
  },
  fuchsia: {
    bubble: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    text: "text-fuchsia-600 dark:text-fuchsia-300",
    bar: "bg-gradient-to-r from-fuchsia-400 to-fuchsia-600",
    ring: "ring-fuchsia-400/60",
    soft: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/25",
    hoverBorder: "hover:border-fuchsia-300 dark:hover:border-fuchsia-500/40",
  },
  blue: {
    bubble: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    text: "text-blue-600 dark:text-blue-300",
    bar: "bg-gradient-to-r from-blue-400 to-blue-600",
    ring: "ring-blue-400/60",
    soft: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/25",
    hoverBorder: "hover:border-blue-300 dark:hover:border-blue-500/40",
  },
  green: {
    bubble: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300",
    text: "text-green-600 dark:text-green-300",
    bar: "bg-gradient-to-r from-green-400 to-green-600",
    ring: "ring-green-400/60",
    soft: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/25",
    hoverBorder: "hover:border-green-300 dark:hover:border-green-500/40",
  },
  gray: {
    bubble: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-300",
    text: "text-gray-500 dark:text-gray-300",
    bar: "bg-gradient-to-r from-gray-400 to-gray-600",
    ring: "ring-gray-400/60",
    soft: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/25",
    hoverBorder: "hover:border-gray-300 dark:hover:border-gray-500/40",
  },
};

const SIZES = {
  xs: { box: "w-5 h-5", icon: "w-3 h-3" },
  sm: { box: "w-7 h-7", icon: "w-3.5 h-3.5" },
  md: { box: "w-8 h-8", icon: "w-4 h-4" },
  lg: { box: "w-11 h-11", icon: "w-5 h-5" },
} as const;

/** A coloured icon on a soft circular background. */
export function IconBubble({
  icon: Icon,
  tone,
  size = "sm",
  active,
  className = "",
  fill,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: keyof typeof SIZES;
  active?: boolean;
  className?: string;
  fill?: boolean;
}) {
  const s = SIZES[size];
  return (
    <span className={`icon-bubble ${s.box} ${TONES[tone].bubble} ${active ? `ring-2 ${TONES[tone].ring}` : ""} ${className}`} aria-hidden="true">
      <Icon className={s.icon} fill={fill ? "currentColor" : "none"} />
    </span>
  );
}

/* ---------------- Knowledge category (history, person, …) ---------------- */

export const KNOWLEDGE_TYPE_STYLE: Record<string, { icon: LucideIcon; tone: Tone; label: string }> = {
  person: { icon: User, tone: "sky", label: "Person" },
  history: { icon: BookOpen, tone: "amber", label: "History" },
  traditional: { icon: Flame, tone: "orange", label: "Traditional" },
  politics: { icon: Scale, tone: "indigo", label: "Politics" },
  education: { icon: GraduationCap, tone: "emerald", label: "Education" },
  culture: { icon: Palette, tone: "fuchsia", label: "Culture" },
  government: { icon: Landmark, tone: "violet", label: "Government" },
  event: { icon: CalendarDays, tone: "teal", label: "Event" },
};

export function knowledgeTypeStyle(type?: string | null) {
  const key = (type || "").trim().toLowerCase();
  return KNOWLEDGE_TYPE_STYLE[key] || { icon: FileText, tone: "gray" as Tone, label: key ? key[0].toUpperCase() + key.slice(1) : "Record" };
}

/** Record category shown as an icon; the name appears on hover (tooltip + title). */
export function KnowledgeTypeIcon({ type, showLabel, size = "sm" }: { type?: string | null; showLabel?: boolean; size?: keyof typeof SIZES }) {
  const st = knowledgeTypeStyle(type);
  return (
    <span className="tip-wrap inline-flex items-center gap-1.5" title={st.label} aria-label={st.label} role="img">
      <IconBubble icon={st.icon} tone={st.tone} size={size} className="hover-pop" />
      {showLabel ? <span className={`text-xs font-medium ${TONES[st.tone].text}`}>{st.label}</span> : <span className="tip" aria-hidden="true">{st.label}</span>}
    </span>
  );
}

/* ---------------- Entity type (PERSON, PLACE, …) ---------------- */

export const ENTITY_TYPE_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  PERSON: { icon: User, tone: "sky" },
  PLACE: { icon: MapPin, tone: "emerald" },
  INSTITUTION: { icon: GraduationCap, tone: "violet" },
  ORGANIZATION: { icon: Users, tone: "indigo" },
  ORGANISATION: { icon: Users, tone: "indigo" },
  EVENT: { icon: CalendarDays, tone: "teal" },
  TOPIC: { icon: Hash, tone: "rose" },
};

export function entityTypeStyle(type?: string | null) {
  return ENTITY_TYPE_STYLE[(type || "").toUpperCase()] || { icon: Building2, tone: "gray" as Tone };
}
