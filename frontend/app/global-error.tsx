"use client";

import { useEffect } from "react";

const FLAG = "aphring-chunk-reload";

function isChunkLoadError(error: Error & { digest?: string }) {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(
    `${error.name} ${error.message}`,
  );
}

export default function GlobalError({
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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
        <p style={{ color: "#52525b", marginTop: "0.75rem" }}>
          A page script failed to load. Try refreshing.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #d4d4d8",
            background: "#18181b",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
