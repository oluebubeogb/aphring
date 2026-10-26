"use client";

import Link from "next/link";

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

export function Chip({ children, href, title }: { children: React.ReactNode; href?: string; title?: string }) {
  const cls = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-xs text-secondary";
  return href ? (
    <Link href={href} className={`${cls} hover:text-primary hover:border-accent/40`} title={title}>
      {children}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {children}
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
  tabs: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
            value === t.value ? "border-accent text-primary font-medium" : "border-transparent text-secondary hover:text-primary"
          }`}
        >
          {t.label}
          {t.badge ? <span className="ml-1.5 text-xs px-1.5 rounded-full bg-surface border border-border">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Record category label (person, history, traditional, …) — bold small-caps, not entity names. */
export const knowledgeTypeCls = "font-bold uppercase tracking-wide [font-variant:small-caps]";

export function entityHref(e: { type?: string; entityType?: string; slug: string }) {
  return `/explore/${(e.type || e.entityType || "topic").toLowerCase()}/${e.slug}`;
}
