"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Mic } from "lucide-react";
import Header from "@/components/Header";
import { api, isLoggedIn, KNOWLEDGE_TYPES } from "@/lib/api";
import { btnPrimary, inputCls, Notice, Page, textareaCls } from "@/components/ui";

export default function OralHistoryPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [place, setPlace] = useState("");
  const [type, setType] = useState("history");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ extracted: number; message: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.push("/login?next=/oral");
  }, [router]);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData();
    form.append("audio", file);
    form.append("type", type);
    if (place.trim()) form.append("placeText", place.trim());
    if (transcript.trim()) form.append("transcript", transcript.trim());
    try {
      const res = await api<{ extracted: number; message: string }>("/api/oral", { method: "POST", body: form });
      setResult(res);
      setFile(null);
      setTranscript("");
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Oral history</h1>
        <p className="text-secondary mb-8">
          Upload a recording (MP3, M4A, WAV, OGG, WebM · max 25 MB). Paste a transcript if you have one; otherwise it is
          transcribed automatically when the server has speech-to-text configured. Transcripts become draft records for moderator review.
        </p>
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1.5">Place (optional)</label>
              <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} placeholder="e.g. Ohafia" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1.5">Category</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border hover:border-accent/40 cursor-pointer">
            <Mic className="w-8 h-8 text-secondary" />
            <span className="text-sm">{file ? file.name : "Choose an audio file"}</span>
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div>
            <label className="block text-sm text-secondary mb-1.5">Transcript (optional)</label>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} className={textareaCls} />
          </div>
          <button onClick={handleUpload} disabled={!file || busy} className={btnPrimary}>
            {busy ? "Uploading…" : "Upload recording"}
          </button>
          {error && <Notice kind="error">{error}</Notice>}
          {result && (
            <div className="p-4 rounded-xl border border-border bg-surface flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="text-sm">
                <p>{result.message}</p>
                <Link href="/me" className="underline text-secondary">
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
