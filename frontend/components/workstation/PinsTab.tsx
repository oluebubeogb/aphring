"use client";

/**
 * Workstation → Pins (Promoted records). Admin only.
 * Pin verified records into the right rail, choose FORCED / RELATIONAL, order the
 * pyramid (top step = lowest sort order), pause / remove, and read impressions + clicks.
 * This section is expected to grow (targeting, schedules, richer analytics).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Pause, Pin, Play, Plus, Search, Trash2 } from "lucide-react";
import { api, timeAgo } from "@/lib/api";
import { IconBubble, KnowledgeTypeIcon } from "@/components/Colorful";
import { btnGhost, btnPrimary, inputCls, Notice } from "@/components/ui";

type Mode = "FORCED" | "RELATIONAL";
interface AdminPin {
  id: string;
  mode: Mode;
  sortOrder: number;
  active: boolean;
  note: string | null;
  impressionCount: number;
  clickCount: number;
  createdAt: string;
  knowledgeRecord: { id: string; title: string; type: string; status: string; placeText: string | null; createdBy: { id: string; username: string } | null };
  pinnedBy: { id: string; username: string } | null;
}
interface Candidate {
  id: string;
  title: string;
  type: string;
  placeText: string | null;
  pinned: boolean;
}
interface Analytics {
  impressions: number;
  clicks: number;
  ctr: number;
  daily: { day: string; impressions: number; clicks: number }[];
  recent: { id: string; type: string; context: string | null; createdAt: string; user: { username: string } | null }[];
}

const MODE_HELP: Record<Mode, string> = {
  FORCED: "Shown to everyone on every page with a rail.",
  RELATIONAL: "Shown only when it fits the viewer's interests or the entities/type on their current screen.",
};

export default function PinsTab({ flash }: { flash: (m: string) => void }) {
  const [pins, setPins] = useState<AdminPin[] | null>(null);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [mode, setMode] = useState<Mode>("FORCED");
  const [openStats, setOpenStats] = useState<string | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);

  const load = useCallback(() => {
    api<{ pins: AdminPin[] }>("/api/workstation/pins")
      .then((r) => setPins(r.pins))
      .catch((e) => flash(e.message));
  }, [flash]);
  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ records: Candidate[] }>(`/api/workstation/pins/candidates?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setCands(r.records))
        .catch(() => setCands([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, pins]);

  async function call(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) flash(ok);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }

  const add = (id: string) =>
    call(() => api("/api/workstation/pins", { method: "POST", body: JSON.stringify({ knowledgeRecordId: id, mode }) }), "Pinned.");
  const patch = (id: string, body: Partial<Pick<AdminPin, "mode" | "sortOrder" | "active" | "note">>) =>
    call(() => api(`/api/workstation/pins/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const remove = (p: AdminPin) => {
    if (!confirm(`Remove the pin for “${p.knowledgeRecord.title}”? Its analytics are deleted too. Pause instead to keep them.`)) return;
    call(() => api(`/api/workstation/pins/${p.id}`, { method: "DELETE" }), "Pin removed.");
  };
  function move(idx: number, dir: -1 | 1) {
    if (!pins) return;
    const active = pins.filter((p) => p.active);
    const j = idx + dir;
    if (j < 0 || j >= active.length) return;
    const order = active.map((p) => p.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    call(() => api("/api/workstation/pins/reorder", { method: "POST", body: JSON.stringify({ order }) }));
  }
  async function toggleStats(id: string) {
    if (openStats === id) return setOpenStats(null);
    setOpenStats(id);
    setStats(null);
    try {
      setStats(await api<Analytics>(`/api/workstation/pins/${id}/analytics`));
    } catch (e: any) {
      flash(e.message);
    }
  }

  const active = (pins || []).filter((p) => p.active);
  const paused = (pins || []).filter((p) => !p.active);

  const row = (p: AdminPin, i: number, isActive: boolean) => (
    <li key={p.id} className={`rounded-xl border border-border bg-surface/80 p-3 space-y-2 ${isActive ? ["ml-0", "ml-2", "ml-4", "ml-6", "ml-8"][Math.min(i, 4)] : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {isActive && <span className="text-xs font-mono text-secondary w-6 text-center">#{i + 1}</span>}
        <KnowledgeTypeIcon type={p.knowledgeRecord.type} size="xs" />
        <Link href={`/record/${p.knowledgeRecord.id}`} className="font-medium hover:underline min-w-0 flex-1 truncate">
          {p.knowledgeRecord.title}
        </Link>
        <span className="text-xs text-secondary">
          {p.impressionCount.toLocaleString()} views · {p.clickCount.toLocaleString()} clicks
          {p.impressionCount ? ` · ${((p.clickCount / p.impressionCount) * 100).toFixed(1)}%` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={p.mode}
          onChange={(e) => patch(p.id, { mode: e.target.value as Mode })}
          className="h-9 px-2 rounded-lg border border-border bg-surface text-sm"
          title={MODE_HELP[p.mode]}
        >
          <option value="FORCED">Forced</option>
          <option value="RELATIONAL">Relational</option>
        </select>
        <label className="inline-flex items-center gap-1 text-xs text-secondary">
          Order
          <input
            type="number"
            defaultValue={p.sortOrder}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== p.sortOrder) patch(p.id, { sortOrder: Math.max(0, Math.round(v)) });
            }}
            className="h-9 w-20 px-2 rounded-lg border border-border bg-surface text-sm"
          />
        </label>
        {isActive && (
          <>
            <button className={btnGhost} onClick={() => move(i, -1)} disabled={i === 0} title="Move up a step">
              <ArrowUp className="w-4 h-4" />
            </button>
            <button className={btnGhost} onClick={() => move(i, 1)} disabled={i === active.length - 1} title="Move down a step">
              <ArrowDown className="w-4 h-4" />
            </button>
          </>
        )}
        <button className={btnGhost} onClick={() => patch(p.id, { active: !p.active })}>
          {p.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {p.active ? "Pause" : "Resume"}
        </button>
        <button className={btnGhost} onClick={() => toggleStats(p.id)}>
          <BarChart3 className="w-4 h-4" /> Analytics
        </button>
        <button className={`${btnGhost} hover:text-red-600`} onClick={() => remove(p)}>
          <Trash2 className="w-4 h-4" /> Remove
        </button>
        <span className="text-xs text-secondary ml-auto">
          by @{p.pinnedBy?.username || "?"} · owner @{p.knowledgeRecord.createdBy?.username || "?"} · {timeAgo(p.createdAt)}
        </span>
      </div>
      {openStats === p.id && (
        <div className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-2">
          {!stats ? (
            <p className="text-secondary">Loading…</p>
          ) : (
            <>
              <p>
                <b>{stats.impressions.toLocaleString()}</b> impressions · <b>{stats.clicks.toLocaleString()}</b> clicks · {(stats.ctr * 100).toFixed(1)}% CTR
              </p>
              {stats.daily.length > 0 && (
                <div className="flex items-end gap-0.5 h-12" aria-label="Impressions, last 30 days">
                  {stats.daily.map((d) => {
                    const max = Math.max(...stats.daily.map((x) => x.impressions), 1);
                    return (
                      <div
                        key={d.day}
                        title={`${new Date(d.day).toLocaleDateString()}: ${d.impressions} views, ${d.clicks} clicks`}
                        className="tone-rose tone-bar w-2 rounded-t"
                        style={{ height: `${Math.max(6, (d.impressions / max) * 100)}%` }}
                      />
                    );
                  })}
                </div>
              )}
              <ul className="max-h-40 overflow-y-auto font-mono text-secondary space-y-0.5">
                {stats.recent.map((e) => (
                  <li key={e.id}>
                    {new Date(e.createdAt).toLocaleString()} · {e.type.toLowerCase()} · {e.user ? `@${e.user.username}` : "guest"} · {e.context || "-"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <Notice>
        <span className="inline-flex items-center gap-2">
          <IconBubble icon={Pin} tone="rose" size="xs" />
          Pins appear in the right rail, top → bottom by order (lowest number on the top step). Analytics are visible only to admins and each
          record&apos;s owner. This section will keep growing.
        </span>
      </Notice>

      <section className="space-y-3">
        <h3 className="font-medium">Pin a verified record</h3>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search verified records by title…" className={`${inputCls} pl-9`} />
          </div>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="h-11 px-3 rounded-lg border border-border bg-surface text-sm">
            <option value="FORCED">Forced (everyone)</option>
            <option value="RELATIONAL">Relational (interest / screen)</option>
          </select>
        </div>
        <p className="text-xs text-secondary">{MODE_HELP[mode]}</p>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface/80 max-h-72 overflow-y-auto">
          {cands.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <KnowledgeTypeIcon type={c.type} size="xs" />
              <span className="flex-1 truncate">{c.title}</span>
              {c.pinned ? (
                <span className="text-xs text-secondary">already pinned</span>
              ) : (
                <button className={btnPrimary} onClick={() => add(c.id)}>
                  <Plus className="w-4 h-4" /> Pin
                </button>
              )}
            </li>
          ))}
          {cands.length === 0 && <li className="px-3 py-2 text-sm text-secondary">No verified records match.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Live pins ({active.length})</h3>
        {pins === null && <p className="text-sm text-secondary">Loading…</p>}
        {pins && active.length === 0 && <p className="text-sm text-secondary">Nothing pinned yet.</p>}
        <ul className="space-y-2">{active.map((p, i) => row(p, i, true))}</ul>
      </section>

      {paused.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-medium">Paused ({paused.length})</h3>
          <ul className="space-y-2">{paused.map((p, i) => row(p, i, false))}</ul>
        </section>
      )}
    </div>
  );
}
