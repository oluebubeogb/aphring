"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header, { useSession } from "@/components/Header";
import { ActionBar, EntityChips, useRecordActions, type PublicRecord } from "@/components/RecordCard";
import { api, isLoggedIn, KNOWLEDGE_TYPES, timeAgo } from "@/lib/api";
import { btnGhost, btnPrimary, inputCls, Notice, Page, StatusPill, textareaCls, KnowledgeTypeIcon } from "@/components/ui";
import { PinAnalyticsStrip, WithPinRail } from "@/components/PinRail";

type Full = PublicRecord & { revisions: number; reviewNote?: string | null };
interface Correction {
  id: string;
  field: string;
  proposedText: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  proposedBy: { username: string; name: string | null };
}

function RecordView({ initial }: { initial: Full }) {
  const router = useRouter();
  const { user } = useSession();
  const a = useRecordActions(initial);
  const rec = a.rec as Full;
  const verified = rec.status === "VERIFIED";
  const isOwner = user && rec.createdBy?.id === user.id;

  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [field, setField] = useState("CONTENT");
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");
  const [cMsg, setCMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: rec.title, content: rec.content, type: rec.type, placeText: rec.placeText || "" });

  useEffect(() => {
    if (verified) api<Correction[]>(`/api/corrections?recordId=${rec.id}`).then(setCorrections).catch(() => {});
  }, [rec.id, verified]);

  useEffect(() => {
    if (field === "TITLE") setProposed(rec.title);
    else if (field === "CONTENT") setProposed(rec.content);
    else if (field === "PLACE") setProposed(rec.placeText || "");
    else setProposed("");
  }, [field, rec.title, rec.content, rec.placeText]);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn()) return router.push(`/login?next=/record/${rec.id}`);
    try {
      await api("/api/corrections", {
        method: "POST",
        body: JSON.stringify({ knowledgeRecordId: rec.id, field, proposedText: proposed, reason }),
      });
      setCMsg({ kind: "ok", text: "Correction sent to moderators. Accepted corrections count toward your badges." });
      setReason("");
      setCorrections(await api(`/api/corrections?recordId=${rec.id}`));
    } catch (err: any) {
      setCMsg({ kind: "error", text: err.message });
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const updated = await api<PublicRecord>(`/api/knowledge/${rec.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...edit, placeText: edit.placeText || null }),
      });
      a.setRec({ ...rec, ...updated });
      setEditing(false);
    } catch (err: any) {
      a.flash(err.message);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this record?")) return;
    try {
      await api(`/api/knowledge/${rec.id}`, { method: "DELETE" });
      router.push("/me");
    } catch (err: any) {
      a.flash(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-secondary flex-wrap">
          <StatusPill status={rec.status} />
          <KnowledgeTypeIcon type={rec.type} />
          {rec.placeText && <span>· {rec.placeText}</span>}
          {rec.createdBy && (
            <>
              · by <Link href={`/u/${rec.createdBy.username}`} className="hover:text-primary">@{rec.createdBy.username}</Link>
            </>
          )}
          {rec.revisions > 0 && <span>· {rec.revisions} revision(s)</span>}
        </div>
        {!verified && rec.reviewNote && <Notice>Moderator note: {rec.reviewNote}</Notice>}
        {!verified && <Notice>Only you and moderators can see this record until it is verified.</Notice>}

        {editing ? (
          <form onSubmit={saveEdit} className="space-y-3">
            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={inputCls} />
            <textarea value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} rows={10} className={textareaCls} />
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={edit.placeText} onChange={(e) => setEdit({ ...edit, placeText: e.target.value })} placeholder="Place" className={inputCls} />
              <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })} className={inputCls}>
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary}>Save and resubmit</button>
              <button type="button" className={btnGhost} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{rec.title}</h1>
            <p className="whitespace-pre-line leading-relaxed text-primary">{rec.content}</p>
          </>
        )}
        <EntityChips entities={rec.entities} />
        {rec.citations.length > 0 && (
          <p className="text-xs text-secondary">
            Source:{" "}
            {rec.citations
              .map((c) => `${c.document?.filename || "document"}${c.paragraph ? ` (${c.paragraph})` : ""}${c.page ? ` p.${c.page}` : ""}`)
              .join("; ")}
          </p>
        )}
        <ActionBar a={a} full />
        {verified && (isOwner || user?.role === "ADMIN") && <PinAnalyticsStrip recordId={rec.id} />}
        {isOwner && !verified && !editing && (
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className={btnGhost} onClick={remove}>
              Delete
            </button>
          </div>
        )}
      </div>

      {verified && (
        <section id="correct" className="space-y-4 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Corrections</h2>
          <p className="text-sm text-secondary">
            Spotted an error? Propose a correction. Moderators review it; there are no comment threads.
          </p>
          <form onSubmit={propose} className="space-y-3">
            <select value={field} onChange={(e) => setField(e.target.value)} className={`${inputCls} sm:w-60`}>
              <option value="CONTENT">Content</option>
              <option value="TITLE">Title</option>
              <option value="PLACE">Place</option>
              <option value="ENTITIES">People / places tagged</option>
              <option value="OTHER">Other</option>
            </select>
            <textarea value={proposed} onChange={(e) => setProposed(e.target.value)} rows={field === "CONTENT" ? 8 : 3} required minLength={2} className={textareaCls} placeholder="Proposed text" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} placeholder="Why? Cite your source if you can" className={inputCls} />
            <button className={btnPrimary}>Propose correction</button>
            {cMsg && <Notice kind={cMsg.kind}>{cMsg.text}</Notice>}
          </form>
          {corrections.length > 0 && (
            <ul className="space-y-2">
              {corrections.map((c) => (
                <li key={c.id} className="p-3 rounded-lg border border-border bg-surface text-sm">
                  <div className="text-xs text-secondary mb-1">
                    {c.field.toLowerCase()} · @{c.proposedBy.username} · {timeAgo(c.createdAt)} · <StatusPill status={c.status === "ACCEPTED" ? "VERIFIED" : "PENDING"} />{" "}
                    {c.status.toLowerCase()}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line">{c.proposedText}</p>
                  <p className="text-xs text-secondary mt-1">Reason: {c.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<Full | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Full>(`/api/knowledge/${id}`)
      .then(setRec)
      .catch((e) => setError(e.status === 404 ? "This record does not exist or is not public." : e.message));
  }, [id]);
  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail context={rec ? { entityIds: rec.entities.map((e) => e.id), types: [rec.type], excludeRecordId: rec.id } : undefined}>
      <Page>
        {error && <Notice>{error}</Notice>}
        {!rec && !error && <p className="text-secondary">Loading…</p>}
        {rec && <RecordView key={rec.id} initial={rec} />}
      </Page>
      </WithPinRail>
    </div>
  );
}
