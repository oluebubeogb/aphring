"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import Header, { useSession } from "@/components/Header";
import { api, downloadFile, ENTITY_TYPES, isLoggedIn, isStaff, KNOWLEDGE_TYPES, timeAgo } from "@/lib/api";
import { btnGhost, btnPrimary, inputCls, Notice, Page, StatusPill, Tabs, textareaCls } from "@/components/ui";

type Tab = "queue" | "corrections" | "reports" | "entities" | "people" | "ops";
type EntityDraft = { name: string; type: string; reason?: string; existingId?: string };

interface StaffRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  placeText: string | null;
  reviewNote: string | null;
  createdAt: string;
  createdBy: { id: string; username: string; name: string; reputation: number } | null;
  citations: { id: string; paragraph: string | null; page: number | null; document: { id: string; filename: string; mimeType: string } | null }[];
  entities: { id: string; name: string; slug: string; entityType: string; source: string }[];
  _count: { reports: number; corrections: number; revisions: number };
}

// ------------------------------------------------------------------ Queue

function ReviewPanel({ record, onDone }: { record: StaffRecord; onDone: (msg: string) => void }) {
  const [title, setTitle] = useState(record.title);
  const [content, setContent] = useState(record.content);
  const [type, setType] = useState(record.type);
  const [place, setPlace] = useState(record.placeText || "");
  const [reason, setReason] = useState("");
  const [entities, setEntities] = useState<EntityDraft[]>([]);
  const [suggestions, setSuggestions] = useState<EntityDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("PERSON");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = record.entities
      .filter((e) => e.source !== "TOPIC" && e.source !== "PLACE")
      .map((e) => ({ name: e.name, type: e.entityType, existingId: e.id }));
    setEntities(existing);
    api<EntityDraft[]>(`/api/workstation/records/${record.id}/suggestions`)
      .then((s) => {
        // The contributor's place is handled by the Place field, not the entity list.
        const rest = s.filter((x) => x.reason !== "Contributor's place");
        const key = (x: EntityDraft) => `${x.type}:${x.name.toLowerCase()}`;
        const have = new Set(existing.map(key));
        setEntities((cur) => (cur.length ? cur : rest));
        setSuggestions(existing.length ? rest.filter((x) => !have.has(key(x))) : []);
      })
      .catch(() => {});
  }, [record]);

  function addEntity(e: EntityDraft) {
    setEntities((cur) => (cur.some((x) => x.type === e.type && x.name.toLowerCase() === e.name.toLowerCase()) ? cur : [...cur, e]));
    setSuggestions((s) => s.filter((x) => x !== e));
  }

  async function submit(decision: "VERIFY" | "REJECT" | "PENDING") {
    if (decision === "REJECT" && !reason.trim()) return setError("Give a reason so the contributor can fix it.");
    setBusy(true);
    setError("");
    try {
      const body: any = { decision, reason: reason.trim() || undefined, type, place: place.trim() || null };
      if (title !== record.title) body.title = title;
      if (content !== record.content) body.content = content;
      if (decision === "VERIFY") body.entities = entities.map(({ name, type }) => ({ name, type }));
      await api(`/api/workstation/records/${record.id}/review`, { method: "POST", body: JSON.stringify(body) });
      onDone(decision === "VERIFY" ? "Verified and published." : decision === "REJECT" ? "Rejected." : "Moved back to pending.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const docs = record.citations.filter((c) => c.document);

  return (
    <div className="space-y-4">
      <div className="text-xs text-secondary flex flex-wrap gap-2 items-center">
        <StatusPill status={record.status} />
        <span>by @{record.createdBy?.username} (rep {record.createdBy?.reputation})</span>
        <span>· {timeAgo(record.createdAt)}</span>
        {record._count.reports > 0 && <span className="text-red-600">· {record._count.reports} open report(s)</span>}
        {docs.map((c) => (
          <button
            key={c.id}
            className="underline"
            onClick={() => downloadFile(`/api/documents/${c.document!.id}/download`, c.document!.filename)}
          >
            {c.document!.filename} {c.paragraph ? `(${c.paragraph})` : ""}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className={textareaCls} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-secondary mb-1">Place (as typed: “{record.placeText || "none"}”)</label>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Normalise, e.g. Item" className={inputCls} />
          <p className="text-[11px] text-secondary mt-1">Matched to an existing place by name or alias when verified.</p>
        </div>
        <div>
          <label className="block text-xs text-secondary mb-1">Category</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {KNOWLEDGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Index under (shown on Explore once verified)</p>
        <div className="flex flex-wrap gap-2">
          {entities.map((e, i) => (
            <span key={`${e.type}-${e.name}-${i}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-border text-xs">
              <span className="text-secondary">{e.type.toLowerCase()}:</span> {e.name}
              {e.existingId && <span className="text-green-600" title="Existing entity">●</span>}
              <button onClick={() => setEntities((cur) => cur.filter((_, j) => j !== i))} className="p-0.5 hover:text-red-600" aria-label="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {entities.length === 0 && <span className="text-xs text-secondary">No entities. Add people, schools, events below.</span>}
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-secondary">Suggestions:</span>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => addEntity(s)} title={s.reason} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border text-xs text-secondary hover:text-primary">
                <Plus className="w-3 h-3" /> {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-9 px-2 rounded-lg border border-border bg-surface text-sm">
            {ENTITY_TYPES.filter((t) => t !== "TOPIC").map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim().length >= 2) {
                e.preventDefault();
                addEntity({ name: newName.trim(), type: newType });
                setNewName("");
              }
            }}
            placeholder="Add an entity and press Enter"
            className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
      </div>

      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Note to contributor (required to reject)" className={inputCls} />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => submit("VERIFY")} className={btnPrimary}>
          Verify &amp; publish
        </button>
        <button disabled={busy} onClick={() => submit("REJECT")} className={btnGhost}>
          Reject
        </button>
        {record.status !== "PENDING" && (
          <button disabled={busy} onClick={() => submit("PENDING")} className={btnGhost}>
            Move to pending
          </button>
        )}
      </div>
    </div>
  );
}

function QueueTab({ flash }: { flash: (m: string) => void }) {
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ total: number; records: StaffRecord[] } | null>(null);
  const [selected, setSelected] = useState<StaffRecord | null>(null);

  const load = useCallback(() => {
    api(`/api/workstation/queue?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => {
        setData(d);
        setSelected((s) => (s ? d.records.find((r: StaffRecord) => r.id === s.id) || d.records[0] || null : d.records[0] || null));
      })
      .catch((e) => flash(e.message));
  }, [status, q, flash]);
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-2 rounded-lg border border-border bg-surface text-sm">
            {["PENDING", "VERIFIED", "REJECTED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm" />
          </form>
        </div>
        <p className="text-xs text-secondary">{data?.total ?? 0} record(s)</p>
        <ul className="space-y-1 max-h-[70vh] overflow-y-auto">
          {data?.records.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r)}
                className={`w-full text-left p-3 rounded-lg border text-sm ${selected?.id === r.id ? "border-accent bg-surface" : "border-border hover:bg-surface"}`}
              >
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-xs text-secondary truncate">
                  @{r.createdBy?.username} · {r.placeText || "no place"} · {timeAgo(r.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        {selected ? (
          <ReviewPanel
            key={selected.id}
            record={selected}
            onDone={(m) => {
              flash(m);
              setSelected(null);
              load();
            }}
          />
        ) : (
          <Notice>Queue is clear.</Notice>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Corrections

function CorrectionsTab({ flash }: { flash: (m: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    api<any[]>("/api/workstation/corrections").then(setItems).catch((e) => flash(e.message));
  }, [flash]);
  useEffect(load, [load]);
  async function review(id: string, decision: "ACCEPT" | "REJECT") {
    try {
      await api(`/api/workstation/corrections/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note: notes[id] || undefined, appliedText: applied[id] || undefined }),
      });
      flash(decision === "ACCEPT" ? "Correction applied." : "Correction rejected.");
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  if (!items.length) return <Notice>No pending corrections.</Notice>;
  return (
    <div className="space-y-4">
      {items.map((c) => {
        const current = c.field === "TITLE" ? c.knowledgeRecord.title : c.field === "PLACE" ? c.knowledgeRecord.placeText : c.knowledgeRecord.content;
        const auto = ["TITLE", "CONTENT", "PLACE"].includes(c.field);
        return (
          <div key={c.id} className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <p className="text-xs text-secondary">
              {c.field.toLowerCase()} on{" "}
              <Link href={`/record/${c.knowledgeRecord.id}`} className="underline">
                {c.knowledgeRecord.title}
              </Link>{" "}
              · by @{c.proposedBy.username} (rep {c.proposedBy.reputation}) · {timeAgo(c.createdAt)}
            </p>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-secondary mb-1">Current</p>
                <p className="whitespace-pre-line p-2 rounded border border-border bg-background max-h-48 overflow-y-auto">{current || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">Proposed {auto ? "(editable before applying)" : ""}</p>
                {auto ? (
                  <textarea
                    defaultValue={c.proposedText}
                    onChange={(e) => setApplied({ ...applied, [c.id]: e.target.value })}
                    rows={6}
                    className={textareaCls}
                  />
                ) : (
                  <p className="whitespace-pre-line p-2 rounded border border-border bg-background">{c.proposedText}</p>
                )}
              </div>
            </div>
            <p className="text-sm">
              <span className="text-secondary">Reason:</span> {c.reason}
            </p>
            {!auto && <p className="text-xs text-secondary">Apply this one by hand (Queue → Verified) before accepting.</p>}
            <input placeholder="Note (required to reject)" onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} className={inputCls} />
            <div className="flex gap-2">
              <button className={btnPrimary} onClick={() => review(c.id, "ACCEPT")}>
                Accept
              </button>
              <button className={btnGhost} onClick={() => review(c.id, "REJECT")}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Reports

function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const load = useCallback(() => {
    api<any[]>("/api/workstation/reports").then(setItems).catch((e) => flash(e.message));
  }, [flash]);
  useEffect(load, [load]);
  async function act(id: string, status: "RESOLVED" | "DISMISSED", unpublish = false) {
    let note: string | undefined;
    if (unpublish) {
      note = window.prompt("Reason for unpublishing (sent to the contributor)") || undefined;
      if (!note) return;
    }
    try {
      await api(`/api/workstation/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status, unpublish, note }) });
      flash("Report updated.");
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  if (!items.length) return <Notice>No open reports.</Notice>;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <div key={r.id} className="p-4 rounded-xl border border-border bg-surface space-y-2">
          <p className="text-xs text-secondary">
            @{r.user.username} · {timeAgo(r.createdAt)} ·{" "}
            <Link href={`/record/${r.knowledgeRecord.id}`} className="underline">
              {r.knowledgeRecord.title}
            </Link>{" "}
            <StatusPill status={r.knowledgeRecord.status} />
          </p>
          <p className="text-sm">{r.reason}</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} onClick={() => act(r.id, "DISMISSED")}>
              Dismiss
            </button>
            <button className={btnGhost} onClick={() => act(r.id, "RESOLVED")}>
              Resolved (fixed)
            </button>
            <button className={btnGhost} onClick={() => act(r.id, "RESOLVED", true)}>
              Unpublish record
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Entities

function EntitiesTab({ flash, admin }: { flash: (m: string) => void; admin: boolean }) {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (q) p.set("q", q);
    if (catalog) p.set("catalog", "1");
    api<any[]>(`/api/workstation/entities?${p}`).then(setItems).catch((e) => flash(e.message));
  }, [type, q, catalog, flash]);
  useEffect(load, [type, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    try {
      await api(`/api/workstation/entities/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          type: editing.entityType,
          description: editing.description || null,
          aliases: String(editing.aliasesText || "")
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length >= 2),
        }),
      });
      flash("Entity saved.");
      setEditing(null);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function merge() {
    if (!mergeTarget) return;
    try {
      await api(`/api/workstation/entities/${editing.id}/merge`, { method: "POST", body: JSON.stringify({ targetId: mergeTarget }) });
      flash("Merged.");
      setEditing(null);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function remove() {
    if (!window.confirm(`Delete ${editing.name}? Records stay; only the index entry is removed.`)) return;
    try {
      await api(`/api/workstation/entities/${editing.id}`, { method: "DELETE" });
      setEditing(null);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 px-2 rounded-lg border border-border bg-surface text-sm">
            <option value="">All types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 px-3 rounded-lg border border-border bg-surface text-sm" />
          </form>
          <label className="text-sm text-secondary flex items-center gap-1">
            <input type="checkbox" checked={catalog} onChange={(e) => setCatalog(e.target.checked)} /> include unlinked catalog places
          </label>
        </div>
        <table className="w-full text-sm border border-border rounded-xl overflow-hidden">
          <thead className="bg-surface text-secondary text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Links</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr
                key={e.id}
                onClick={() => setEditing({ ...e, aliasesText: (e.aliases || []).join(", ") })}
                className={`border-t border-border cursor-pointer hover:bg-surface ${editing?.id === e.id ? "bg-surface" : ""}`}
              >
                <td className="px-3 py-2">{e.name}</td>
                <td className="px-3 py-2 text-secondary">{e.entityType.toLowerCase()}</td>
                <td className="px-3 py-2 text-right">{e._count.knowledgeLinks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-3 h-fit">
          <p className="font-medium">Edit entity</p>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
          <select value={editing.entityType} onChange={(e) => setEditing({ ...editing, entityType: e.target.value })} className={inputCls}>
            {ENTITY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} placeholder="Short description" className={textareaCls} />
          <input value={editing.aliasesText} onChange={(e) => setEditing({ ...editing, aliasesText: e.target.value })} placeholder="Aliases, comma separated" className={inputCls} />
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={save}>
              Save
            </button>
            <button className={btnGhost} onClick={() => setEditing(null)}>
              Close
            </button>
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs text-secondary">Merge this duplicate into:</p>
            <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className={inputCls}>
              <option value="">Choose…</option>
              {items
                .filter((x) => x.id !== editing.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.entityType.toLowerCase()})
                  </option>
                ))}
            </select>
            <button className={btnGhost} onClick={merge} disabled={!mergeTarget}>
              Merge
            </button>
          </div>
          {admin && (
            <button className="text-sm text-red-600 underline" onClick={remove}>
              Delete entity
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ People (admin)

function PeopleTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const load = useCallback(() => {
    api<any[]>(`/api/workstation/users${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setUsers).catch((e) => flash(e.message));
    api<any[]>("/api/workstation/invites").then(setInvites).catch(() => {});
  }, [q, flash]);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(name: string) {
    try {
      await api("/api/workstation/invites", { method: "POST", body: JSON.stringify({ username: name }) });
      flash(`Invited @${name}. They accept from their profile page.`);
      setUsername("");
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  async function cancel(id: string) {
    await api(`/api/workstation/invites/${id}`, { method: "DELETE" }).catch((e) => flash(e.message));
    load();
  }
  async function revoke(id: string, name: string) {
    if (!window.confirm(`Remove moderator role from @${name}?`)) return;
    try {
      await api(`/api/workstation/users/${id}/revoke-moderator`, { method: "POST" });
      flash(`@${name} is no longer a moderator.`);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) invite(username.trim().replace(/^@/, "").toLowerCase());
        }}
        className="flex gap-2 max-w-md"
      >
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Invite a registered username as moderator" className={inputCls} />
        <button className={btnPrimary}>Invite</button>
      </form>
      <p className="text-xs text-secondary">
        Admins come only from the <code>ADMIN_USERNAMES</code> environment variable. Remove a name there and restart to demote.
      </p>
      {invites.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Pending invites</p>
          <ul className="space-y-1 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                @{i.user.username} · invited by @{i.invitedBy.username} · {timeAgo(i.createdAt)}
                <button className="text-xs underline text-secondary" onClick={() => cancel(i.id)}>
                  cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="h-9 px-3 rounded-lg border border-border bg-surface text-sm" />
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border">
          <thead className="bg-surface text-secondary text-left">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Records</th>
              <th className="px-3 py-2 text-right">Rep</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {u.name} <span className="text-secondary">@{u.username}</span>
                </td>
                <td className="px-3 py-2 text-secondary">{u.email}</td>
                <td className="px-3 py-2">
                  {u.role.toLowerCase()}
                  {u.envAdmin && <span className="text-xs text-secondary"> (env)</span>}
                </td>
                <td className="px-3 py-2 text-right">{u._count.knowledgeRecords}</td>
                <td className="px-3 py-2 text-right">{u.reputation}</td>
                <td className="px-3 py-2 text-right">
                  {u.role === "USER" && u.invitesReceived.length === 0 && (
                    <button className="text-xs underline" onClick={() => invite(u.username)}>
                      invite as moderator
                    </button>
                  )}
                  {u.role === "USER" && u.invitesReceived.length > 0 && <span className="text-xs text-secondary">invited</span>}
                  {u.role === "MODERATOR" && (
                    <button className="text-xs underline text-red-600" onClick={() => revoke(u.id, u.username)}>
                      revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Ops (admin)

function OpsTab({ flash }: { flash: (m: string) => void }) {
  const [ops, setOps] = useState<any | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const load = useCallback(() => {
    api("/api/workstation/ops").then(setOps).catch((e) => flash(e.message));
    api<any[]>("/api/workstation/audit").then(setAudit).catch(() => {});
  }, [flash]);
  useEffect(load, [load]);
  async function reindex() {
    try {
      const r = await api<{ requested: number; embedded: number }>("/api/workstation/reindex", { method: "POST" });
      flash(`Embedded ${r.embedded} of ${r.requested} records.`);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  }
  if (!ops) return null;
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="p-4 rounded-xl border border-border bg-surface space-y-1">
          <p className="font-medium">Admins (ADMIN_USERNAMES)</p>
          <p className="text-secondary">{ops.envAdmins.length ? ops.envAdmins.map((u: string) => `@${u}`).join(", ") : "none set"}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-surface space-y-1">
          <p className="font-medium">Embeddings</p>
          <p className="text-secondary">
            {ops.embeddings.enabled ? `On · ${ops.embeddings.model}${ops.embeddings.fake ? " (FAKE, dev only)" : ""}` : "Off · keyword search is used"}
          </p>
          <p className="text-secondary">
            {ops.embeddings.embedded} embedded · {ops.embeddings.stale} waiting
          </p>
          {ops.embeddings.enabled && ops.embeddings.stale > 0 && (
            <button className={btnGhost} onClick={reindex}>
              Embed waiting records
            </button>
          )}
        </div>
        <div className="p-4 rounded-xl border border-border bg-surface space-y-1">
          <p className="font-medium">AI services</p>
          <p className="text-secondary">Chat model (Runpod): {ops.chatModel.configured ? "configured" : "not configured, answers quote verified records directly"}</p>
          <p className="text-secondary">Speech-to-text: {ops.stt.configured ? "configured" : "not configured, transcripts must be pasted"}</p>
        </div>
      </div>
      <div>
        <p className="font-medium mb-2">Audit log</p>
        <ul className="text-xs space-y-1 max-h-96 overflow-y-auto font-mono">
          {audit.map((a) => (
            <li key={a.id} className="text-secondary">
              {new Date(a.createdAt).toLocaleString()} · @{a.actor?.username || "system"} · {a.action}
              {a.target ? ` · ${a.target}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Page

export default function WorkstationPage() {
  const router = useRouter();
  const { user, ready } = useSession();
  const [tab, setTab] = useState<Tab>("queue");
  const [stats, setStats] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const flash = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) router.push("/login?next=/workstation");
  }, [router]);
  useEffect(() => {
    if (isStaff(user)) api("/api/workstation/stats").then(setStats).catch(() => {});
  }, [user, tab, msg]);

  if (!ready) return null;
  if (!isStaff(user)) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <Page>
          <Notice>The workstation is for moderators and admins.</Notice>
        </Page>
      </div>
    );
  }
  const admin = user!.role === "ADMIN";
  const tabs: { value: Tab; label: string; badge?: number }[] = [
    { value: "queue", label: "Review queue", badge: stats?.pending },
    { value: "corrections", label: "Corrections", badge: stats?.corrections },
    { value: "reports", label: "Reports", badge: stats?.reports },
    { value: "entities", label: "Entities" },
  ];
  if (admin) tabs.push({ value: "people", label: "People" }, { value: "ops", label: "Ops" });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page wide>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Workstation</h1>
          {stats && (
            <p className="text-sm text-secondary">
              {stats.verified} verified · {stats.pending} pending · {stats.entities} entities · {stats.users} users · {stats.moderators} moderators
            </p>
          )}
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        {msg && (
          <div className="mt-4">
            <Notice kind="ok">{msg}</Notice>
          </div>
        )}
        <div className="mt-6">
          {tab === "queue" && <QueueTab flash={flash} />}
          {tab === "corrections" && <CorrectionsTab flash={flash} />}
          {tab === "reports" && <ReportsTab flash={flash} />}
          {tab === "entities" && <EntitiesTab flash={flash} admin={admin} />}
          {tab === "people" && admin && <PeopleTab flash={flash} />}
          {tab === "ops" && admin && <OpsTab flash={flash} />}
        </div>
      </Page>
    </div>
  );
}
