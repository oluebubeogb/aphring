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
}

interface PendingRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  createdBy: { name: string; email: string };
  community: { name: string } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    Promise.all([
      api<Stats>("/api/admin/stats"),
      api<PendingRecord[]>("/api/admin/pending"),
    ])
      .then(([s, p]) => {
        setStats(s);
        setPending(p);
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, []);

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
          <span className="text-sm text-secondary">Verification Dashboard</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-12">
            {[
              ["Users", stats.users],
              ["Documents", stats.documents],
              ["Pending", stats.pending],
              ["Verified", stats.verified],
              ["Communities", stats.communities],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="p-4 rounded-xl border border-border bg-surface text-center"
              >
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-secondary mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        <h2 className="text-lg font-medium mb-4">
          Pending Verification ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="text-secondary text-sm">No pending records.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <div
                key={r.id}
                className="p-5 rounded-xl border border-border bg-surface"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-wide text-secondary bg-background px-2 py-0.5 rounded">
                    {r.type}
                  </span>
                  <span className="text-xs text-secondary">
                    by {r.createdBy.name}
                  </span>
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
