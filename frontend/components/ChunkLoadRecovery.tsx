"use client";

import { useEffect } from "react";

const FLAG = "aphring-chunk-reload";

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : String((err as { message?: string }).message ?? err);
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    msg,
  );
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(FLAG) === "1") return;
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* private mode */
  }
  window.location.reload();
}

/** Soft recovery when a Next.js route chunk fails (often QUIC / stale deploy). */
export function ChunkLoadRecovery() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(FLAG);
    } catch {
      /* ignore */
    }

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        event.preventDefault();
        reloadOnce();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        event.preventDefault();
        reloadOnce();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
