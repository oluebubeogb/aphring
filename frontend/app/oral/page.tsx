"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, Upload, CheckCircle } from "lucide-react";
import { api, isLoggedIn } from "@/lib/api";

export default function OralHistoryPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ extracted: number; message: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.push("/login");
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    const form = new FormData();
    form.append("audio", file);
    if (transcript.trim()) form.append("transcript", transcript.trim());

    try {
      const res = await api<{ extracted: number; message: string }>("/api/oral", {
        method: "POST",
        body: form,
      });
      setResult(res);
      setFile(null);
      setTranscript("");
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">
            aphring
          </Link>
          <nav className="flex gap-4 text-sm text-secondary">
            <Link href="/submit" className="hover:text-primary">Documents</Link>
            <Link href="/chat" className="hover:text-primary">Chat</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <Mic className="w-6 h-6 text-secondary" />
          <h1 className="text-3xl font-semibold tracking-tight">Oral History</h1>
        </div>
        <p className="text-secondary mb-10">
          Record or upload community oral history. Audio is transcribed and facts
          are extracted for moderator verification.
        </p>

        <div className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-accent/40 transition">
          <Upload className="w-8 h-8 text-secondary mx-auto mb-4" />
          <p className="text-primary mb-1">Upload audio</p>
          <p className="text-sm text-secondary mb-4">MP3, WAV, WebM, M4A · max 50MB</p>
          <label className="inline-block px-4 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-surface transition">
            Choose file
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {file && (
            <p className="mt-3 text-sm text-primary">{file.name}</p>
          )}
        </div>

        <div className="mt-6">
          <label className="block text-sm text-secondary mb-1.5">
            Transcript (optional — auto-filled if Whisper is configured)
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="Paste or type the spoken content if you already have a transcript…"
            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/20 text-sm"
          />
        </div>

        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-6 w-full h-12 rounded-xl bg-accent text-background font-medium disabled:opacity-50"
          >
            {uploading ? "Processing…" : "Upload & Extract Knowledge"}
          </button>
        )}

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        {result && (
          <div className="mt-6 p-4 rounded-xl border border-border bg-surface flex gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Done</p>
              <p className="text-sm text-secondary mt-1">{result.message}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
