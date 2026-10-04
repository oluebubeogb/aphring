"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, isLoggedIn } from "@/lib/api";

interface Stats {
  users: number;
  documents: number;
  pending: number;
  verified: number;
  communities: number;
  reports: number;
  audio: number;
  votes: number;
}

interface PendingRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  upvotes: number;
  downvotes: number;
  sourceRank: number;
  createdBy: { name: string; email: string; reputation: number };
  community: { name: string } | null;
}

interface Doc {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  uploadedBy: { name: string; email: string };
  _count: { citations: number };
}

type Tab = "pending" | "documents" | "users";

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    load();
  }, []);

  async function load() {
    try {
      const [s, p, d] = await Promise.all([
        api<Stats>("/api/admin/stats"),
        api<PendingRecord[]>("/api/admin/pending"),
        api<Doc[]>("/api/admin/documents"),
      ]);
      setStats(s);
      setPending(p);
      setDocs(d);
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: "VERIFIED" | "REJECTED") {
    await api(`/api/knowledge/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setPending((prev) => prev.filter((r) => r.id !== id));
    if (stats) {
      setStats({
        ...stats,
        pending: stats.pending - 1,
        verified: status === "VERIFIED" ? stats.verified + 1 : stats.verified,
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">
            aphring
          </Link>
          <span className="text-sm text-secondary">Admin · Phase 2</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            {(
              [
                ["Users", stats.users],
                ["Documents", stats.documents],
                ["Pending", stats.pending],
                ["Verified", stats.verified],
                ["Communities", stats.communities],
                ["Reports", stats.reports],
                ["Audio", stats.audio],
                ["Votes", stats.votes],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="p-4 rounded-xl border border-border bg-surface text-center"
              >
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-secondary mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-6 border-b border-border pb-2">
          {(
            [
              ["pending", "Pending"],
              ["documents", "Uploaded files"],
              ["users", "Overview"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                tab === key
                  ? "bg-accent text-background"
                  : "text-secondary hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "pending" && (
          <div className="space-y-4">
            {pending.length === 0 ? (
              <p className="text-secondary text-sm">No pending records.</p>
            ) : (
              pending.map((r) => (
                <div
                  key={r.id}
                  className="p-5 rounded-xl border border-border bg-surface"
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs uppercase tracking-wide text-secondary bg-background px-2 py-0.5 rounded">
                      {r.type}
                    </span>
                    <span className="text-xs text-secondary">
                      by {r.createdBy.name} · rep {r.createdBy.reputation}
                    </span>
                    {(r.upvotes > 0 || r.downvotes > 0) && (
                      <span className="text-xs text-secondary">
                        ↑{r.upvotes} ↓{r.downvotes} · rank {r.sourceRank}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="mt-2 text-sm text-secondary leading-relaxed line-clamp-3">
                    {r.content}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => updateStatus(r.id, "VERIFIED")}
                      className="px-3 py-1.5 rounded-lg bg-accent text-background text-sm font-medium"
                    >
                      Verify
                    </button>
                    <button
                      onClick={() => updateStatus(r.id, "REJECTED")}
                      className="px-3 py-1.5 rounded-lg border border-border text-sm text-secondary hover:text-primary"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {docs.length === 0 ? (
              <p className="text-secondary text-sm">No documents uploaded yet.</p>
            ) : (
              docs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface text-sm"
                >
                  <div>
                    <p className="font-medium text-primary">{d.filename}</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {d.uploadedBy.name} · {(d.size / 1024).toFixed(1)} KB ·{" "}
                      {d._count.citations} citations ·{" "}
                      {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "users" && stats && (
          <p className="text-secondary text-sm">
            {stats.users} users · {stats.communities} communities ·{" "}
            {stats.verified} verified records · {stats.votes} community votes
          </p>
        )}
      </main>
    </div>
  );
}
