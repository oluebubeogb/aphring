"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, FileText, CheckCircle } from "lucide-react";
import { api, isLoggedIn } from "@/lib/api";
import { useEffect } from "react";

export default function SubmitPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ extracted: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.push("/login");
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await api<{ extracted: number }>("/api/documents", {
        method: "POST",
        body: form,
      });
      setResult(res);
      setFile(null);
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
          <Link href="/chat" className="text-sm text-secondary hover:text-primary">
            Chat
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Contribute Knowledge
        </h1>
        <p className="text-secondary mb-10">
          Upload PDFs, documents or text. Aphring extracts facts for verification.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition ${
            dragging
              ? "border-accent bg-surface"
              : "border-border hover:border-accent/40"
          }`}
        >
          <Upload className="w-8 h-8 text-secondary mx-auto mb-4" />
          <p className="text-primary mb-1">Drag & drop a file here</p>
          <p className="text-sm text-secondary mb-4">PDF, TXT, DOC, DOCX · max 20MB</p>
          <label className="inline-block px-4 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-surface transition">
            Browse files
            <input
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {file && (
          <div className="mt-6 flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-secondary" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-secondary">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium disabled:opacity-50"
            >
              {uploading ? "Processing…" : "Upload & Extract"}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}

        {result && (
          <div className="mt-6 p-4 rounded-xl border border-border bg-surface flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium">Upload complete</p>
              <p className="text-sm text-secondary mt-1">
                Extracted {result.extracted} draft knowledge records. They are
                pending moderator verification.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
