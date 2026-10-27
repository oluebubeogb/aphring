"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowBigDown, ArrowBigUp, Bookmark, BookmarkCheck, Download, FileText, Flag, Share2, PencilLine } from "lucide-react";
import { api, downloadFile, isLoggedIn, timeAgo } from "@/lib/api";
import { Chip, entityHref } from "@/components/ui";
import { entityTypeStyle, KnowledgeTypeIcon, TONES, type Tone } from "@/components/Colorful";

export interface RecordEntity {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  source?: string;
}
export interface PublicRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  placeText: string | null;
  upvotes: number;
  downvotes: number;
  sourceRank: number;
  createdAt: string;
  verifiedAt: string | null;
  createdBy: { id: string; username: string; name: string | null; reputation?: number } | null;
  verifiedBy: { id: string; username: string; name?: string | null } | null;
  citations: { id: string; page: number | null; paragraph: string | null; document: { id: string; filename: string; mimeType: string; size?: number } | null }[];
  entities: RecordEntity[];
  pendingCorrections: number;
  saves: number;
  myVote: "UP" | "DOWN" | null;
  saved: boolean;
}

/** Social actions shared by cards and the record page: vote, save, share, download, report. */
export function useRecordActions(initial: PublicRecord) {
  const router = useRouter();
  const [rec, setRec] = useState(initial);
  const [msg, setMsg] = useState("");

  const needLogin = () => {
    if (!isLoggedIn()) {
      router.push(`/login?next=/record/${rec.id}`);
      return true;
    }
    return false;
  };
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  async function vote(type: "UP" | "DOWN") {
    if (needLogin()) return;
    try {
      const r = await api<{ voted: "UP" | "DOWN" | null; upvotes: number; downvotes: number; sourceRank: number }>(
        `/api/votes/${rec.id}`,
        { method: "POST", body: JSON.stringify({ type }) }
      );
      setRec((x) => ({ ...x, myVote: r.voted, upvotes: r.upvotes, downvotes: r.downvotes, sourceRank: r.sourceRank }));
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function save() {
    if (needLogin()) return;
    try {
      const r = await api<{ saved: boolean }>(`/api/me/saves/${rec.id}`, { method: "POST" });
      setRec((x) => ({ ...x, saved: r.saved, saves: x.saves + (r.saved ? 1 : -1) }));
      flash(r.saved ? "Saved" : "Removed from saved");
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function share() {
    const url = `${window.location.origin}/record/${rec.id}`;
    try {
      if (navigator.share) await navigator.share({ title: rec.title, url });
      else {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  }
  async function downloadMd() {
    try {
      await downloadFile(`/api/knowledge/${rec.id}/export`, `${rec.title}.md`);
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function downloadSource(docId: string, name: string) {
    try {
      await downloadFile(`/api/documents/${docId}/download`, name);
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function report() {
    if (needLogin()) return;
    const reason = window.prompt("What is wrong with this record? (at least 5 characters)");
    if (!reason) return;
    try {
      await api("/api/reports", { method: "POST", body: JSON.stringify({ knowledgeRecordId: rec.id, reason }) });
      flash("Reported. A moderator will review it.");
    } catch (e: any) {
      flash(e.message);
    }
  }
  return { rec, setRec, msg, flash, vote, save, share, downloadMd, downloadSource, report };
}

/** Small round action button. Votes keep green/red; other actions are calm gray. */
function ActBtn({
  tone,
  active,
  label,
  onClick,
  title,
  children,
}: {
  tone: Tone;
  active?: boolean;
  label?: React.ReactNode;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`act-btn group ${active ? TONES[tone].text + " font-medium" : ""}`} onClick={onClick} title={title} aria-label={title} aria-pressed={active}>
      <span className={`icon-bubble w-7 h-7 transition duration-200 group-hover:scale-110 ${TONES[tone].bubble} ${active ? `ring-2 ${TONES[tone].ring}` : ""}`}>
        {children}
      </span>
      {label !== undefined && label !== "" && label !== false && <span>{label}</span>}
    </button>
  );
}

export function ActionBar({ a, full }: { a: ReturnType<typeof useRecordActions>; full?: boolean }) {
  const { rec } = a;
  const verified = rec.status === "VERIFIED";
  const docs = Array.from(new Map(rec.citations.filter((c) => c.document).map((c) => [c.document!.id, c.document!])).values());
  const ic = "w-3.5 h-3.5";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {verified && (
        <>
          <ActBtn tone="green" active={rec.myVote === "UP"} onClick={() => a.vote("UP")} title="Upvote" label={rec.upvotes}>
            <ArrowBigUp className={ic} fill={rec.myVote === "UP" ? "currentColor" : "none"} />
          </ActBtn>
          <ActBtn tone="rose" active={rec.myVote === "DOWN"} onClick={() => a.vote("DOWN")} title="Downvote" label={rec.downvotes}>
            <ArrowBigDown className={ic} fill={rec.myVote === "DOWN" ? "currentColor" : "none"} />
          </ActBtn>
          <ActBtn tone="gray" active={rec.saved} onClick={a.save} title={rec.saved ? "Saved" : "Save"} label={full ? (rec.saved ? "Saved" : "Save") : rec.saves || ""}>
            {rec.saved ? <BookmarkCheck className={ic} /> : <Bookmark className={ic} />}
          </ActBtn>
          <ActBtn tone="gray" onClick={a.share} title="Share" label={full ? "Share" : ""}>
            <Share2 className={ic} />
          </ActBtn>
        </>
      )}
      <ActBtn tone="gray" onClick={a.downloadMd} title="Download as Markdown" label={full ? ".md" : ""}>
        <Download className={ic} />
      </ActBtn>
      {full &&
        docs.map((d) => (
          <ActBtn key={d.id} tone="gray" onClick={() => a.downloadSource(d.id, d.filename)} title="Download the source file" label={d.filename}>
            <FileText className={ic} />
          </ActBtn>
        ))}
      {verified && (
        <ActBtn tone="gray" onClick={a.report} title="Report" label={full ? "Report" : ""}>
          <Flag className={ic} />
        </ActBtn>
      )}
      {!full && verified && (
        <Link href={`/record/${rec.id}#correct`} className="act-btn group" title="Suggest a correction" aria-label="Suggest a correction">
          <span className={`icon-bubble w-7 h-7 transition duration-200 group-hover:scale-110 ${TONES.gray.bubble}`}>
            <PencilLine className={ic} />
          </span>
        </Link>
      )}
      {a.msg && <span className="text-xs text-secondary ml-2 animate-fade-in">{a.msg}</span>}
    </div>
  );
}

export function EntityChips({ entities }: { entities: RecordEntity[] }) {
  if (!entities?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entities.map((e) => {
        const st = entityTypeStyle(e.entityType);
        return (
          <Chip key={e.id} href={entityHref(e)} title={e.entityType.toLowerCase()} icon={st.icon}>
            {e.name}
          </Chip>
        );
      })}
    </div>
  );
}

export default function RecordCard({ record, clamp = true }: { record: PublicRecord; clamp?: boolean }) {
  const a = useRecordActions(record);
  const rec = a.rec;
  return (
    <article className="card-lift p-4 rounded-xl border border-border bg-surface space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-secondary flex-wrap">
        <KnowledgeTypeIcon type={rec.type} />
        {rec.placeText && <span>· {rec.placeText}</span>}
        {rec.createdBy && (
          <>
            · <Link href={`/u/${rec.createdBy.username}`} className="hover:text-primary">@{rec.createdBy.username}</Link>
          </>
        )}
        <span>· {timeAgo(rec.verifiedAt || rec.createdAt)}</span>
        {rec.pendingCorrections > 0 && <span>· {rec.pendingCorrections} correction(s) under review</span>}
      </div>
      <Link href={`/record/${rec.id}`} className="block group">
        <h3 className="font-medium text-primary group-hover:underline underline-offset-2">{rec.title}</h3>
        <p className={`text-sm text-secondary mt-1 whitespace-pre-line ${clamp ? "line-clamp-4" : ""}`}>{rec.content}</p>
      </Link>
      <EntityChips entities={rec.entities.filter((e) => e.entityType !== "TOPIC")} />
      <ActionBar a={a} />
    </article>
  );
}
