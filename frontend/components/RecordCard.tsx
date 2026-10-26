"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowBigDown, ArrowBigUp, Bookmark, BookmarkCheck, Download, FileText, Flag, Share2, PencilLine } from "lucide-react";
import { api, downloadFile, isLoggedIn, timeAgo } from "@/lib/api";
import { Chip, entityHref, knowledgeTypeCls } from "@/components/ui";

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

export function ActionBar({ a, full }: { a: ReturnType<typeof useRecordActions>; full?: boolean }) {
  const { rec } = a;
  const verified = rec.status === "VERIFIED";
  const docs = Array.from(new Map(rec.citations.filter((c) => c.document).map((c) => [c.document!.id, c.document!])).values());
  const btn = "inline-flex items-center gap-1 px-2 h-8 rounded-md text-sm text-secondary hover:text-primary hover:bg-surface transition";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {verified && (
        <>
          <button className={`${btn} ${rec.myVote === "UP" ? "text-green-600" : ""}`} onClick={() => a.vote("UP")} title="Upvote">
            <ArrowBigUp className="w-4 h-4" /> {rec.upvotes}
          </button>
          <button className={`${btn} ${rec.myVote === "DOWN" ? "text-red-600" : ""}`} onClick={() => a.vote("DOWN")} title="Downvote">
            <ArrowBigDown className="w-4 h-4" /> {rec.downvotes}
          </button>
          <button className={btn} onClick={a.save} title="Save">
            {rec.saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {full ? (rec.saved ? "Saved" : "Save") : rec.saves || ""}
          </button>
          <button className={btn} onClick={a.share} title="Share">
            <Share2 className="w-4 h-4" /> {full && "Share"}
          </button>
        </>
      )}
      <button className={btn} onClick={a.downloadMd} title="Download as Markdown">
        <Download className="w-4 h-4" /> {full && ".md"}
      </button>
      {full &&
        docs.map((d) => (
          <button key={d.id} className={btn} onClick={() => a.downloadSource(d.id, d.filename)} title="Download the source file">
            <FileText className="w-4 h-4" /> {d.filename}
          </button>
        ))}
      {verified && (
        <button className={btn} onClick={a.report} title="Report">
          <Flag className="w-4 h-4" /> {full && "Report"}
        </button>
      )}
      {!full && verified && (
        <Link href={`/record/${rec.id}#correct`} className={btn} title="Suggest a correction">
          <PencilLine className="w-4 h-4" />
        </Link>
      )}
      {a.msg && <span className="text-xs text-secondary ml-2">{a.msg}</span>}
    </div>
  );
}

export function EntityChips({ entities }: { entities: RecordEntity[] }) {
  if (!entities?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entities.map((e) => (
        <Chip key={e.id} href={entityHref(e)} title={e.entityType.toLowerCase()}>
          {e.name}
        </Chip>
      ))}
    </div>
  );
}

export default function RecordCard({ record, clamp = true }: { record: PublicRecord; clamp?: boolean }) {
  const a = useRecordActions(record);
  const rec = a.rec;
  return (
    <article className="p-4 rounded-xl border border-border bg-surface space-y-2">
      <div className="flex items-center gap-2 text-xs text-secondary flex-wrap">
        <span className={knowledgeTypeCls}>{rec.type}</span>
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
