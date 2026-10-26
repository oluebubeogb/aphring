"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { api } from "@/lib/api";
import { Chip, entityHref, Notice, Page } from "@/components/ui";

interface EntityPage {
  entity: { id: string; name: string; slug: string; type: string; label: string; description: string | null; aliases: string[] };
  records: PublicRecord[];
  related: { id: string; name: string; slug: string; type: string; shared: number }[];
}

export default function EntityPageView() {
  const { type, slug } = useParams<{ type: string; slug: string }>();
  const [data, setData] = useState<EntityPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<EntityPage>(`/api/explore/entities/${type}/${slug}`)
      .then(setData)
      .catch((e) => setError(e.status === 404 ? "Nothing verified about this yet." : e.message));
  }, [type, slug]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Page wide>
        <Link href={`/explore/${type}`} className="text-sm text-secondary hover:text-primary">
          ← {data?.entity.label || "Explore"}
        </Link>
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}
        {data && (
          <div className="grid lg:grid-cols-[1fr_260px] gap-8 mt-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{data.entity.name}</h1>
              {data.entity.description && <p className="text-secondary mt-1">{data.entity.description}</p>}
              {data.entity.aliases.length > 0 && (
                <p className="text-sm text-secondary mt-1">Also known as {data.entity.aliases.join(", ")}</p>
              )}
              <div className="space-y-3 mt-6">
                {data.records.map((r) => (
                  <RecordCard key={r.id} record={r} />
                ))}
              </div>
            </div>
            {data.related.length > 0 && (
              <aside className="space-y-3">
                <h2 className="text-sm font-semibold text-secondary uppercase tracking-wide">Related</h2>
                <div className="flex flex-wrap gap-2">
                  {data.related.map((r) => (
                    <Chip key={r.id} href={entityHref(r)} title={`${r.shared} shared record(s)`}>
                      {r.name}
                    </Chip>
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}
      </Page>
    </div>
  );
}
