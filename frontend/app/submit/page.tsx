"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, FileText, Upload } from "lucide-react";
import Header from "@/components/Header";
import { api, isLoggedIn, KNOWLEDGE_TYPES } from "@/lib/api";
import { btnPrimary, inputCls, Notice, Page, Tabs, textareaCls } from "@/components/ui";

function PlaceAndType({
  place,
  setPlace,
  type,
  setType,
}: {
  place: string;
  setPlace: (v: string) => void;
  type: string;
  setType: (v: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm text-secondary mb-1.5">Place (optional)</label>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={200}
          placeholder="e.g. Item, Bende or Umuahia"
          className={inputCls}
        />
        <p className="text-xs text-secondary mt-1">Type it as you know it. A moderator matches it to the right place.</p>
      </div>
      <div>
        <label className="block text-sm text-secondary mb-1.5">Category</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          {KNOWLEDGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function SubmitPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"file" | "write">("file");
  const [place, setPlace] = useState("");
  const [type, setType] = useState("history");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.push("/login?next=/submit");
  }, [router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult("");
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    if (place.trim()) form.append("placeText", place.trim());
    try {
      const res = await api<{ message: string }>("/api/documents", { method: "POST", body: form });
      setResult(res.message);
      setFile(null);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function write(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult("");
    try {
      await api("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ title, content, type, placeText: place.trim() || null }),
      });
      setResult("Record submitted. It will appear publicly once a moderator verifies it.");
      setTitle("");
      setContent("");
    } catch (err: any) {
      setError(err.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Contribute knowledge</h1>
        <p className="text-secondary mb-6">
          Everything you send is reviewed by a moderator before it becomes public, searchable and counted toward your badges.
          For recordings use <Link href="/oral" className="underline">Oral history</Link>.
        </p>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "file", label: "Upload a file" },
            { value: "write", label: "Write a record" },
          ]}
        />
        <div className="mt-6 space-y-6">
          <PlaceAndType place={place} setPlace={setPlace} type={type} setType={setType} />

          {tab === "file" ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition ${
                  dragging ? "border-accent bg-surface" : "border-border hover:border-accent/40"
                }`}
              >
                <Upload className="w-8 h-8 text-secondary mx-auto mb-4" />
                <p className="text-primary mb-1">Drag & drop a file here</p>
                <p className="text-sm text-secondary mb-4">PDF, DOCX or TXT · max 20 MB · scanned PDFs need OCR first</p>
                <label className="inline-block px-4 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-surface transition">
                  Browse files
                  <input type="file" accept=".pdf,.txt,.docx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              {file && (
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-secondary" />
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button onClick={upload} disabled={busy} className={btnPrimary}>
                    {busy ? "Processing…" : "Upload"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={write} className="space-y-4">
              <div>
                <label className="block text-sm text-secondary mb-1.5">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={300} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1.5">Record</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  minLength={20}
                  rows={10}
                  placeholder="State the facts plainly. Include names, dates and where you learnt it."
                  className={textareaCls}
                />
              </div>
              <button disabled={busy} className={btnPrimary}>
                {busy ? "Submitting…" : "Submit for review"}
              </button>
            </form>
          )}

          {error && <Notice kind="error">{error}</Notice>}
          {result && (
            <div className="p-4 rounded-xl border border-border bg-surface flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm">{result}</p>
                <Link href="/me" className="text-sm underline text-secondary">
                  Track it on your profile
                </Link>
              </div>
            </div>
          )}
        </div>
      </Page>
    </div>
  );
}
