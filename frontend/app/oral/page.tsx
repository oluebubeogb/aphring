"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlignLeft, CheckCircle, Info, MapPin, Mic, PenLine, Tags, Upload } from "lucide-react";
import { WithPinRail } from "@/components/PinRail";
import Header from "@/components/Header";
import { api, isLoggedIn, KNOWLEDGE_TYPES } from "@/lib/api";
import { btnPrimary, FieldLabel, inputCls, Notice, Page, PageTitle, Tabs, textareaCls } from "@/components/ui";
import { IconBubble } from "@/components/Colorful";

const ORAL_HELP = "MP3, M4A, WAV, OGG or WebM · max 25 MB. Add a transcript, or we'll auto-transcribe when speech-to-text is on. Transcripts go to moderators as drafts.";

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
    <div className="min-h-screen">
      <Header />
      <WithPinRail>
      <Page fill>
        <div className="mb-6 flex items-center gap-2">
          <PageTitle icon={Mic} tone="fuchsia" title="Oral history" />
          <span tabIndex={0} className="tip-wrap inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/50" aria-label={ORAL_HELP}>
            <IconBubble icon={Info} tone="slate" size="xs" className="hover-pop" />
            <span className="tip !whitespace-normal w-64 text-left leading-snug !py-1.5" aria-hidden="true">{ORAL_HELP}</span>
          </span>
        </div>
        <Tabs<"file" | "write" | "oral">
          value="oral"
          onChange={(v) => v !== "oral" && router.push(`/submit?tab=${v}`)}
          tabs={[
            { value: "file", label: "Upload a file", icon: Upload, tone: "sky" },
            { value: "write", label: "Write a record", icon: PenLine, tone: "amber" },
            { value: "oral", label: "Oral history", icon: Mic, tone: "fuchsia" },
          ]}
        />
        <div className="mt-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel icon={MapPin} tone="emerald" className="mb-1.5">Place (optional)</FieldLabel>
              <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} placeholder="e.g. Ohafia" className={inputCls} />
            </div>
            <div>
              <FieldLabel icon={Tags} tone="violet" className="mb-1.5">Category</FieldLabel>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {KNOWLEDGE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border hover:border-accent/40 cursor-pointer">
            <IconBubble icon={Mic} tone="fuchsia" size="lg" className="hover-pop" />
            <span className="text-sm">{file ? file.name : "Choose an audio file"}</span>
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div>
            <FieldLabel icon={AlignLeft} tone="sky" className="mb-1.5">Transcript (optional)</FieldLabel>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} className={textareaCls} />
          </div>
          <button onClick={handleUpload} disabled={!file || busy} className={btnPrimary}>
            <Upload className="w-4 h-4" />
            {busy ? "Uploading…" : "Upload recording"}
          </button>
          {error && <Notice kind="error">{error}</Notice>}
          {result && (
            <div className="p-4 rounded-xl border border-border bg-surface flex items-start gap-3">
              <IconBubble icon={CheckCircle} tone="green" size="sm" className="shrink-0" />
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
      </WithPinRail>
    </div>
  );
}
