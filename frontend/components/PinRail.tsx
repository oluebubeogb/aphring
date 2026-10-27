"use client";

/**
 * Right-rail Pins (Promoted records).
 * - usePins(ctx) fetches /api/pins/rail with the active screen's context.
 * - <PinRail> renders pins top → bottom as pyramid steps (each step indents a little more).
 * - Each pin fires one impression when it scrolls into view and a click on open.
 * - <WithPinRail> wraps a page and adds the right column on lg+ (stacked below content on small screens).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { api } from "@/lib/api";
import { IconBubble, KnowledgeTypeIcon } from "@/components/Colorful";
import { appShell } from "@/components/ui";

export interface RailPin {
  id: string;
  mode: "FORCED" | "RELATIONAL";
  sortOrder: number;
  step: number;
  record: {
    id: string;
    title: string;
    type: string;
    placeText: string | null;
    /** Short raw excerpt (legacy). */
    snippet?: string;
    /** AI-written teaser grounded in the record (falls back to a longer excerpt server-side). */
    teaser?: string;
    entities: { id: string; name: string; slug: string; type: string }[];
  };
}

export interface PinContext {
  /** Entity ids on the active screen (entity page, record's entities). */
  entityIds?: string[];
  entityType?: string;
  /** Knowledge types on the active screen. */
  types?: string[];
  /** Don't pin the record that's already open. */
  excludeRecordId?: string;
}

export function usePins(ctx: PinContext = {}) {
  const pathname = usePathname() || "/";
  const [pins, setPins] = useState<RailPin[]>([]);
  const key = JSON.stringify([pathname, ctx.entityIds, ctx.entityType, ctx.types, ctx.excludeRecordId]);
  useEffect(() => {
    const p = new URLSearchParams({ path: pathname });
    if (ctx.entityIds?.length) p.set("entityId", ctx.entityIds.slice(0, 20).join(","));
    if (ctx.entityType) p.set("entityType", ctx.entityType);
    if (ctx.types?.length) p.set("type", ctx.types.join(","));
    if (ctx.excludeRecordId) p.set("exclude", ctx.excludeRecordId);
    let alive = true;
    api<{ pins: RailPin[] }>(`/api/pins/rail?${p.toString()}`)
      .then((r) => alive && setPins(r.pins || []))
      .catch(() => alive && setPins([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return pins;
}

function track(pinId: string, kind: "impression" | "click", path: string) {
  api(`/api/pins/${pinId}/${kind}`, { method: "POST", body: JSON.stringify({ path }), keepalive: true }).catch(() => {});
}

/** Pyramid step indents (top step widest). Written out so Tailwind keeps them. */
const STEP_INDENT = ["ml-0", "ml-2", "ml-4", "ml-6", "ml-8", "ml-10"];

function PinCard({ pin, index }: { pin: RailPin; index: number }) {
  const pathname = usePathname() || "/";
  const ref = useRef<HTMLAnchorElement>(null);
  const seen = useRef(false);
  const teaser = pin.record.teaser || pin.record.snippet || "";

  useEffect(() => {
    const el = ref.current;
    if (!el || seen.current) return;
    const fire = () => {
      if (seen.current) return;
      seen.current = true;
      track(pin.id, "impression", pathname);
    };
    if (typeof IntersectionObserver === "undefined") return fire();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pin.id, pathname]);

  return (
    <Link
      ref={ref}
      href={`/record/${pin.record.id}`}
      onClick={() => track(pin.id, "click", pathname)}
      style={{ animationDelay: `${index * 70}ms` }}
      className={`card-lift animate-fade-up block rounded-xl border border-border bg-surface/80 p-4 ${STEP_INDENT[Math.min(index, STEP_INDENT.length - 1)]}`}
    >
      <div className="flex items-start gap-2">
        <KnowledgeTypeIcon type={pin.record.type} size="xs" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-primary line-clamp-2">{pin.record.title}</p>
          {pin.record.placeText && <p className="text-xs text-secondary mt-0.5 truncate">{pin.record.placeText}</p>}
        </div>
      </div>
      {teaser && <p className="text-[13px] leading-relaxed text-secondary mt-2.5 line-clamp-[7]">{teaser}</p>}
      <span className="mt-2 inline-block text-xs font-medium text-primary/80">Read the record →</span>
    </Link>
  );
}

export function PinRail({ pins, className = "" }: { pins: RailPin[]; className?: string }) {
  if (!pins.length) return null;
  return (
    <section className={`space-y-3 ${className}`} aria-label="Pinned records">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-secondary uppercase tracking-wide">
        <IconBubble icon={Pin} tone="rose" size="xs" /> Pinned
      </h2>
      <div className="space-y-3">
        {pins.map((p, i) => (
          <PinCard key={p.id} pin={p} index={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * Wraps a page body in the shared app shell (same max width + padding as the Header).
 * On lg+ the main column takes 70% and the Pins rail 30%. With no pins the body still
 * fills the full shell so every page keeps the same width whether or not pins show.
 */
export function WithPinRail({ children, context }: { children: React.ReactNode; context?: PinContext }) {
  const pins = usePins(context);
  if (!pins.length) {
    return (
      <div className={appShell}>
        <div className="w-full min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className={`${appShell} lg:flex lg:items-start lg:gap-8`}>
      <div className="w-full min-w-0 lg:w-[70%] lg:max-w-[70%] lg:flex-1">{children}</div>
      <aside className="w-full pb-10 lg:w-[30%] lg:max-w-[30%] lg:shrink-0 lg:pt-8 lg:self-stretch">
        <div className="lg:sticky lg:top-20">
          <PinRail pins={pins} />
        </div>
      </aside>
    </div>
  );
}

/** Impressions / clicks strip for a pinned record — the API only answers for its owner or an admin. */
export function PinAnalyticsStrip({ recordId }: { recordId: string }) {
  const [data, setData] = useState<{ pinned: boolean; pin?: { impressions: number; clicks: number; ctr: number; mode: string; active: boolean } } | null>(null);
  useEffect(() => {
    api(`/api/knowledge/${recordId}/pin-analytics`)
      .then(setData)
      .catch(() => setData(null));
  }, [recordId]);
  if (!data?.pinned || !data.pin) return null;
  const p = data.pin;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/80 px-3 py-2 text-xs text-secondary">
      <IconBubble icon={Pin} tone="rose" size="xs" />
      <span className="font-medium text-primary">Pinned · {p.mode.toLowerCase()}{p.active ? "" : " (paused)"}</span>
      <span>{p.impressions.toLocaleString()} impressions</span>
      <span>{p.clicks.toLocaleString()} clicks</span>
      <span>{(p.ctr * 100).toFixed(1)}% CTR</span>
      <span className="ml-auto">Only you and admins see this</span>
    </div>
  );
}
