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

/**
 * Calm tones. Backgrounds are driven by ONE sitewide knob in globals.css:
 *   :root { --icon-bubble-opacity: 0.32 }   .dark { --icon-bubble-opacity: 0.22 }
 * `.tone-<name>` sets `--tone-rgb`; `.icon-bubble`, `.tone-soft` and `.tone-bar` paint
 * rgb(var(--tone-rgb) / f(var(--icon-bubble-opacity))). Raise the var for richer colour,
 * lower it for fainter. Glyphs stay readable but muted (/80 text opacity).
 */
export const TONES: Record<Tone, { bubble: string; text: string; bar: string; ring: string; soft: string; hoverBorder: string }> = {
  emerald: {
    bubble: "tone-emerald text-emerald-500/80 dark:text-emerald-300/80",
    text: "text-emerald-600 dark:text-emerald-300",
    bar: "tone-emerald tone-bar",
    ring: "ring-emerald-300/40 dark:ring-emerald-400/30",
    soft: "tone-emerald tone-soft text-emerald-700 dark:text-emerald-300",
    hoverBorder: "hover:border-emerald-200 dark:hover:border-emerald-500/30",
  },
  sky: {
    bubble: "tone-sky text-sky-500/80 dark:text-sky-300/80",
    text: "text-sky-600 dark:text-sky-300",
    bar: "tone-sky tone-bar",
    ring: "ring-sky-300/40 dark:ring-sky-400/30",
    soft: "tone-sky tone-soft text-sky-700 dark:text-sky-300",
    hoverBorder: "hover:border-sky-200 dark:hover:border-sky-500/30",
  },
  violet: {
    bubble: "tone-violet text-violet-500/80 dark:text-violet-300/80",
    text: "text-violet-600 dark:text-violet-300",
    bar: "tone-violet tone-bar",
    ring: "ring-violet-300/40 dark:ring-violet-400/30",
    soft: "tone-violet tone-soft text-violet-700 dark:text-violet-300",
    hoverBorder: "hover:border-violet-200 dark:hover:border-violet-500/30",
  },
  amber: {
    bubble: "tone-amber text-amber-500/80 dark:text-amber-300/80",
    text: "text-amber-600 dark:text-amber-300",
    bar: "tone-amber tone-bar",
    ring: "ring-amber-300/40 dark:ring-amber-400/30",
    soft: "tone-amber tone-soft text-amber-700 dark:text-amber-300",
    hoverBorder: "hover:border-amber-200 dark:hover:border-amber-500/30",
  },
  yellow: {
    bubble: "tone-yellow text-yellow-500/80 dark:text-yellow-300/80",
    text: "text-yellow-600 dark:text-yellow-300",
    bar: "tone-yellow tone-bar",
    ring: "ring-yellow-300/40 dark:ring-yellow-400/30",
    soft: "tone-yellow tone-soft text-yellow-700 dark:text-yellow-300",
    hoverBorder: "hover:border-yellow-200 dark:hover:border-yellow-500/30",
  },
  slate: {
    bubble: "tone-slate text-slate-500/80 dark:text-slate-300/80",
    text: "text-slate-600 dark:text-slate-300",
    bar: "tone-slate tone-bar",
    ring: "ring-slate-300/40 dark:ring-slate-400/30",
    soft: "tone-slate tone-soft text-slate-700 dark:text-slate-300",
    hoverBorder: "hover:border-slate-200 dark:hover:border-slate-500/30",
  },
  rose: {
    bubble: "tone-rose text-rose-500/80 dark:text-rose-300/80",
    text: "text-rose-600 dark:text-rose-300",
    bar: "tone-rose tone-bar",
    ring: "ring-rose-300/40 dark:ring-rose-400/30",
    soft: "tone-rose tone-soft text-rose-700 dark:text-rose-300",
    hoverBorder: "hover:border-rose-200 dark:hover:border-rose-500/30",
  },
  teal: {
    bubble: "tone-teal text-teal-500/80 dark:text-teal-300/80",
    text: "text-teal-600 dark:text-teal-300",
    bar: "tone-teal tone-bar",
    ring: "ring-teal-300/40 dark:ring-teal-400/30",
    soft: "tone-teal tone-soft text-teal-700 dark:text-teal-300",
    hoverBorder: "hover:border-teal-200 dark:hover:border-teal-500/30",
  },
  orange: {
    bubble: "tone-orange text-orange-500/80 dark:text-orange-300/80",
    text: "text-orange-600 dark:text-orange-300",
    bar: "tone-orange tone-bar",
    ring: "ring-orange-300/40 dark:ring-orange-400/30",
    soft: "tone-orange tone-soft text-orange-700 dark:text-orange-300",
    hoverBorder: "hover:border-orange-200 dark:hover:border-orange-500/30",
  },
  indigo: {
    bubble: "tone-indigo text-indigo-500/80 dark:text-indigo-300/80",
    text: "text-indigo-600 dark:text-indigo-300",
    bar: "tone-indigo tone-bar",
    ring: "ring-indigo-300/40 dark:ring-indigo-400/30",
    soft: "tone-indigo tone-soft text-indigo-700 dark:text-indigo-300",
    hoverBorder: "hover:border-indigo-200 dark:hover:border-indigo-500/30",
  },
  fuchsia: {
    bubble: "tone-fuchsia text-fuchsia-500/80 dark:text-fuchsia-300/80",
    text: "text-fuchsia-600 dark:text-fuchsia-300",
    bar: "tone-fuchsia tone-bar",
    ring: "ring-fuchsia-300/40 dark:ring-fuchsia-400/30",
    soft: "tone-fuchsia tone-soft text-fuchsia-700 dark:text-fuchsia-300",
    hoverBorder: "hover:border-fuchsia-200 dark:hover:border-fuchsia-500/30",
  },
  blue: {
    bubble: "tone-blue text-blue-500/80 dark:text-blue-300/80",
    text: "text-blue-600 dark:text-blue-300",
    bar: "tone-blue tone-bar",
    ring: "ring-blue-300/40 dark:ring-blue-400/30",
    soft: "tone-blue tone-soft text-blue-700 dark:text-blue-300",
    hoverBorder: "hover:border-blue-200 dark:hover:border-blue-500/30",
  },
  green: {
    bubble: "tone-green text-green-500/80 dark:text-green-300/80",
    text: "text-green-600 dark:text-green-300",
    bar: "tone-green tone-bar",
    ring: "ring-green-300/40 dark:ring-green-400/30",
    soft: "tone-green tone-soft text-green-700 dark:text-green-300",
    hoverBorder: "hover:border-green-200 dark:hover:border-green-500/30",
  },
  gray: {
    bubble: "tone-gray text-gray-500/80 dark:text-gray-300/80",
    text: "text-gray-600 dark:text-gray-300",
    bar: "tone-gray tone-bar",
    ring: "ring-gray-300/40 dark:ring-gray-400/30",
    soft: "tone-gray tone-soft text-gray-700 dark:text-gray-300",
    hoverBorder: "hover:border-gray-200 dark:hover:border-gray-500/30",
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
