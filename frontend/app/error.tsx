"use client";

import { useEffect } from "react";
import { btnPrimary } from "@/components/ui";

const FLAG = "aphring-chunk-reload";

function isChunkLoadError(error: Error & { digest?: string }) {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(
    `${error.name} ${error.message}`,
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkLoadError(error)) return;
    try {
      if (sessionStorage.getItem(FLAG) === "1") return;
      sessionStorage.setItem(FLAG, "1");
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-primary">Something went wrong</h1>
      <p className="text-sm text-secondary">
        A page script failed to load. This is often a brief network glitch — try
        again.
      </p>
      <button type="button" className={btnPrimary} onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
