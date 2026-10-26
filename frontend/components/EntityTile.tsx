import Link from "next/link";
import { entityHref } from "@/components/ui";

export interface ExploreEntity {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string | null;
  recordCount: number;
  /** Passage from a random verified record linked to this entity (no AI). */
  excerpt?: string | null;
  excerptRecordId?: string | null;
}

export default function EntityTile({ e }: { e: ExploreEntity }) {
  return (
    <Link
      href={entityHref(e)}
      className="block min-w-[180px] max-w-[220px] shrink-0 p-4 rounded-xl border border-border bg-surface hover:border-accent/40 transition"
    >
      <p className="font-medium text-primary truncate">{e.name}</p>
      {e.description && <p className="text-xs text-secondary mt-0.5 truncate">{e.description}</p>}
      {e.excerpt && (
        <p className="text-[11px] leading-snug text-secondary mt-2 line-clamp-3 break-words [overflow-wrap:anywhere]">{e.excerpt}</p>
      )}
    </Link>
  );
}
