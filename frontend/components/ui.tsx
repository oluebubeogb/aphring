"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { IconBubble, TONES, type Tone } from "@/components/Colorful";

export { KnowledgeTypeIcon } from "@/components/Colorful";

export const inputCls =
  "w-full h-11 px-3 rounded-lg border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/20";
export const textareaCls =
  "w-full px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/20";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg bg-accent text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm text-secondary hover:text-primary hover:bg-surface disabled:opacity-50 transition";

export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`${wide ? "max-w-6xl" : "max-w-3xl"} mx-auto px-4 sm:px-6 py-8`}>{children}</main>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const cls =
    kind === "error"
      ? "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
      : kind === "ok"
        ? "text-green-700 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
        : "text-secondary bg-surface border-border";
  return <div className={`text-sm px-3 py-2 rounded-lg border ${cls}`}>{children}</div>;
}

export function Chip({
  children,
  href,
  title,
  tone,
  icon,
}: {
  children: React.ReactNode;
  href?: string;
  title?: string;
  /** Soft tinted pill colour (defaults to the plain grey outline). */
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const Icon = icon;
  const colour = tone ? `${TONES[tone].soft}` : "border-border text-secondary";
  const cls = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition duration-200 ${colour}`;
  const inner = (
    <>
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {children}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`${cls} hover:-translate-y-0.5 hover:shadow-sm ${tone ? "hover:brightness-95 dark:hover:brightness-125" : "hover:text-primary hover:border-accent/40"}`}
      title={title}
    >
      {inner}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    VERIFIED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || map.DRAFT}`}>{status.toLowerCase()}</span>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; badge?: number; icon?: LucideIcon; tone?: Tone }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto">
      {tabs.map((t) => {
        const active = value === t.value;
        const tone = t.tone || "violet";
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={`group inline-flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition duration-200 ${
              active ? `${TAB_BORDER[tone]} text-primary font-medium` : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.icon && (
              <IconBubble
                icon={t.icon}
                tone={tone}
                size="xs"
                className={`transition-transform duration-200 group-hover:scale-110 ${active ? "" : "opacity-80 group-hover:opacity-100"}`}
              />
            )}
            {t.label}
            {t.badge ? <span className="ml-0.5 text-xs px-1.5 rounded-full bg-surface border border-border">{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const TAB_BORDER: Record<Tone, string> = {
  emerald: "border-emerald-500",
  sky: "border-sky-500",
  violet: "border-violet-500",
  amber: "border-amber-500",
  yellow: "border-yellow-500",
  slate: "border-slate-500",
  rose: "border-rose-500",
  teal: "border-teal-500",
  orange: "border-orange-500",
  indigo: "border-indigo-500",
  fuchsia: "border-fuchsia-500",
  blue: "border-blue-500",
  green: "border-green-500",
  gray: "border-gray-500",
};

/** Text style for record category names — now only used where a text label is still wanted (forms). Display pages use <KnowledgeTypeIcon>. */
export const knowledgeTypeCls = "font-bold uppercase tracking-wide [font-variant:small-caps]";

export function entityHref(e: { type?: string; entityType?: string; slug: string }) {
  return `/explore/${(e.type || e.entityType || "topic").toLowerCase()}/${e.slug}`;
}

/** Page title with a calm icon bubble (Explore, Contribute, Workstation…). */
export function PageTitle({ icon, tone, title, subtitle }: { icon: LucideIcon; tone: Tone; title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <IconBubble icon={icon} tone={tone} size="lg" className="hover-pop" />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">{title}</h1>
        {subtitle && <p className="text-secondary text-sm mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Brand + icon header used on login / register / password pages. */
export function AuthHeader({ icon, tone, subtitle }: { icon: LucideIcon; tone: Tone; subtitle: React.ReactNode }) {
  return (
    <div className="text-center flex flex-col items-center gap-3 animate-fade-up">
      <IconBubble icon={icon} tone={tone} size="lg" className="animate-float-soft" />
      <Link href="/" className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-primary">
        <span className="brand-mark" aria-hidden="true" />
        aphring
      </Link>
      <p className="text-secondary text-sm">{subtitle}</p>
    </div>
  );
}

/** Form label with a small tone icon. */
export function FieldLabel({ icon, tone, children, className = "" }: { icon: LucideIcon; tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex items-center gap-1.5 text-sm text-secondary ${className}`}>
      <IconBubble icon={icon} tone={tone} size="xs" />
      {children}
    </label>
  );
}

/** Small section heading with an icon bubble. */
export function SectionTitle({ icon, tone, children }: { icon: LucideIcon; tone: Tone; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <IconBubble icon={icon} tone={tone} size="sm" />
      {children}
    </h2>
  );
}
