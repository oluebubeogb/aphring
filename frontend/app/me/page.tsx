"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { BadgeList, MilestoneList, SectionHeading, SECTION_ICONS, StatsGrid, type Badge, type Milestone, type Stats } from "@/components/Badges";
import { api, isLoggedIn, storeUser, timeAgo } from "@/lib/api";
import { btnGhost, btnPrimary, Notice, Page, StatusPill, Tabs } from "@/components/ui";
import { WithPinRail } from "@/components/PinRail";
import { IconBubble } from "@/components/Colorful";
import { CircleUser } from "lucide-react";

interface Profile {
  user: { id: string; username: string; name: string; email: string; role: "USER" | "MODERATOR" | "ADMIN"; reputation: number; createdAt: string };
  stats: Stats;
  submissions: Record<string, number>;
  badges: Badge[];
  milestones: Milestone[];
}
interface Invite {
  id: string;
  createdAt: string;
  invitedBy: { username: string; name: string };
}
type Tab = "submissions" | "saved";
type SubStatus = "PENDING" | "VERIFIED" | "REJECTED";

export default function MePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tab, setTab] = useState<Tab>("submissions");
  const [status, setStatus] = useState<SubStatus>("PENDING");
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [saves, setSaves] = useState<PublicRecord[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const loadProfile = () =>
    api<Profile>("/api/me/profile")
      .then(setP)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login?next=/me");
      return;
    }
    loadProfile();
    api<Invite[]>("/api/me/invites").then(setInvites).catch(() => {});
    api<PublicRecord[]>("/api/me/saves").then(setSaves).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!isLoggedIn()) return;
    api<{ records: PublicRecord[] }>(`/api/knowledge?mine=1&status=${status}&limit=50`)
      .then((r) => setRecords(r.records))
      .catch((e) => setError(e.message));
  }, [status]);

  async function respond(id: string, action: "accept" | "decline") {
    try {
      const r = await api<{ role: string }>(`/api/me/invites/${id}/${action}`, { method: "POST" });
      setInvites((x) => x.filter((i) => i.id !== id));
      if (action === "accept") {
        const me = await api("/api/auth/me");
        storeUser(me);
        setMsg(`You are now a ${r.role.toLowerCase()}. The Workstation is in the header.`);
        loadProfile();
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function resetPersonalisation() {
    if (!window.confirm("Clear the signals used to personalise your Explore and Feed?")) return;
    await api("/api/me/affinity", { method: "DELETE" });
    setMsg("Personalisation reset.");
  }

  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail>
      <Page fill>
        {error && <Notice kind="error">{error}</Notice>}
        {msg && <Notice kind="ok">{msg}</Notice>}
        {p && (
          <div className="space-y-8 mt-2">
            <div className="flex items-start gap-3">
              <IconBubble icon={CircleUser} tone="gray" size="lg" className="hover-pop shrink-0" />
              <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">{p.user.name}</h1>
              <p className="text-secondary text-sm">
                @{p.user.username} · {p.user.role.toLowerCase()} · reputation {p.user.reputation} · joined {timeAgo(p.user.createdAt)} ·{" "}
                <Link href={`/u/${p.user.username}`} className="underline">
                  public profile
                </Link>
              </p>
              </div>
            </div>

            {invites.length > 0 && (
              <section className="space-y-2">
                {invites.map((i) => (
                  <div key={i.id} className="p-4 rounded-xl border border-accent/40 bg-surface flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm">
                      <strong>@{i.invitedBy.username}</strong> invited you to become a moderator.
                    </p>
                    <div className="flex gap-2">
                      <button className={btnPrimary} onClick={() => respond(i.id, "accept")}>
                        Accept
                      </button>
                      <button className={btnGhost} onClick={() => respond(i.id, "decline")}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-3">
              <SectionHeading icon={SECTION_ICONS.work}>Verified work</SectionHeading>
              <StatsGrid stats={p.stats} />
            </section>
            <section className="space-y-3">
              <SectionHeading icon={SECTION_ICONS.badges}>Badges</SectionHeading>
              <BadgeList badges={p.badges} />
            </section>
            <section className="space-y-3">
              <SectionHeading icon={SECTION_ICONS.milestones}>Milestones</SectionHeading>
              <MilestoneList milestones={p.milestones} />
            </section>

            <section className="space-y-4">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "submissions", label: "My submissions", icon: SECTION_ICONS.submissions, tone: "gray" },
                  { value: "saved", label: "Saved", badge: saves.length, icon: SECTION_ICONS.saved, tone: "gray" },
                ]}
              />
              {tab === "submissions" ? (
                <>
                  <div className="flex gap-2">
                    {(["PENDING", "VERIFIED", "REJECTED"] as SubStatus[]).map((s) => (
                      <button key={s} onClick={() => setStatus(s)} className={`${btnGhost} ${status === s ? "border-accent text-primary" : ""}`}>
                        {s.toLowerCase()} ({p.submissions[s] || 0})
                      </button>
                    ))}
                  </div>
                  {records.length === 0 && <p className="text-sm text-secondary">Nothing here.</p>}
                  <ul className="space-y-2">
                    {records.map((r) => (
                      <li key={r.id} className="p-3 rounded-lg border border-border bg-surface">
                        <Link href={`/record/${r.id}`} className="flex items-center justify-between gap-3">
                          <span className="truncate">{r.title}</span>
                          <span className="flex items-center gap-2 shrink-0 text-xs text-secondary">
                            {timeAgo(r.createdAt)} <StatusPill status={r.status} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="space-y-3">
                  {saves.length === 0 && <p className="text-sm text-secondary">Save records from the feed to read later.</p>}
                  {saves.map((r) => (
                    <RecordCard key={r.id} record={r} />
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-border pt-6">
              <button className={btnGhost} onClick={resetPersonalisation}>
                Reset my Explore personalisation
              </button>
            </section>
          </div>
        )}
      </Page>
      </WithPinRail>
    </div>
  );
}
