import Link from "next/link";
import { entityHref } from "@/components/ui";

export interface ExploreEntity {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string | null;
  recordCount: number;
  reason?: string;
}

export default function EntityTile({ e }: { e: ExploreEntity }) {
  return (
    <Link
      href={entityHref(e)}
      className="block min-w-[180px] max-w-[220px] shrink-0 p-4 rounded-xl border border-border bg-surface hover:border-accent/40 transition"
    >
      <p className="font-medium text-primary truncate">{e.name}</p>
      {e.description && <p className="text-xs text-secondary mt-0.5 truncate">{e.description}</p>}
      <p className="text-xs text-secondary mt-2">
        {e.recordCount} verified record{e.recordCount === 1 ? "" : "s"}
      </p>
      {e.reason && <p className="text-[11px] text-secondary mt-1 italic">{e.reason}</p>}
    </Link>
  );
}
