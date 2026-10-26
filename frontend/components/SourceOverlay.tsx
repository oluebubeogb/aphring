"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";
import { EntityChips, type PublicRecord } from "@/components/RecordCard";

export interface SourceRef {
  id: string;
  title: string;
  type: string;
}

/**
 * Chat source preview: opens over the conversation (blurred scrim) instead of navigating away.
 * Esc or a click on the backdrop closes it. Never scrolls sideways (long words/URLs wrap).
 */
export default function SourceOverlay({ source, index, onClose }: { source: SourceRef; index?: number; onClose: () => void }) {
  const [rec, setRec] = useState<PublicRecord | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setRec(null);
    setError("");
    api<PublicRecord>(`/api/knowledge/${source.id}`)
      .then((r) => alive && setRec(r))
      .catch((e) => alive && setError(e.status === 404 ? "This source is no longer available." : e.message || "Couldn't load this source."));
    return () => {
      alive = false;
    };
  }, [source.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title = rec?.title || source.title;
  const type = rec?.type || source.type;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm overflow-x-hidden"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-overlay-title"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background shadow-xl overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-border min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-secondary uppercase tracking-wide">
              {index !== undefined && <span className="mr-1">[{index + 1}]</span>}
              {type}
              {rec?.placeText && <span className="normal-case"> · {rec.placeText}</span>}
            </p>
            <h2 id="source-overlay-title" className="text-lg font-semibold text-primary mt-0.5 break-words [overflow-wrap:anywhere]">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="relative group">
              <Link
                href={`/record/${source.id}`}
                target="_blank"
                rel="noopener"
                aria-label="Open in new page"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-primary text-background text-xs px-2 py-1 shadow opacity-0 translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition z-10"
              >
                Open in new page
              </span>
            </span>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto overflow-x-hidden space-y-4 min-w-0">
          {error && <Notice kind="error">{error}</Notice>}
          {!rec && !error && <p className="text-sm text-secondary">Loading source…</p>}
          {rec && (
            <>
              <p className="text-sm leading-relaxed text-primary whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{rec.content}</p>
              <EntityChips entities={rec.entities.filter((e) => e.entityType !== "TOPIC")} />
              {rec.citations.length > 0 && (
                <div className="text-xs text-secondary space-y-0.5 break-words [overflow-wrap:anywhere]">
                  <p className="uppercase tracking-wide">Cited from</p>
                  {rec.citations.map((c) => (
                    <p key={c.id}>
                      {c.document?.filename || "Document"}
                      {c.paragraph ? ` (${c.paragraph})` : c.page ? ` (p. ${c.page})` : ""}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
