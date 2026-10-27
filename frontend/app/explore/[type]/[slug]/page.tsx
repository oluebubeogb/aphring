"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import RecordCard, { type PublicRecord } from "@/components/RecordCard";
import { api } from "@/lib/api";
import { Chip, entityHref, Notice, Page } from "@/components/ui";
import EmptyContribute from "@/components/EmptyContribute";
import { PinRail, usePins } from "@/components/PinRail";
import { entityTypeStyle } from "@/components/Colorful";
import { PageTitle } from "@/components/ui";

interface EntityPage {
  entity: { id: string; name: string; slug: string; type: string; label: string; description: string | null; aliases: string[] };
  records: PublicRecord[];
  related: { id: string; name: string; slug: string; type: string; shared: number }[];
}

export default function EntityPageView() {
  const { type, slug } = useParams<{ type: string; slug: string }>();
  const [data, setData] = useState<EntityPage | null>(null);
  const [error, setError] = useState("");
  const pins = usePins({
    entityIds: data ? [data.entity.id, ...data.related.slice(0, 8).map((r) => r.id)] : undefined,
    entityType: data?.entity.type,
    types: data ? [...new Set(data.records.map((r) => r.type))] : undefined,
  });

  useEffect(() => {
    api<EntityPage>(`/api/explore/entities/${type}/${slug}`)
      .then(setData)
      .catch((e) => setError(e.status === 404 ? "__EMPTY__" : e.message));
  }, [type, slug]);

  return (
    <div className="min-h-screen">
      <Header />
      <Page wide>
        <Link href={`/explore/${type}`} className="text-sm text-secondary hover:text-primary">
          ← {data?.entity.label || "Explore"}
        </Link>
        {error === "__EMPTY__" && (
          <div className="mt-4">
            <EmptyContribute
              title="Nothing verified about this yet"
              detail="If you know facts, stories or sources, contribute them so this page can fill in after verification."
            />
          </div>
        )}
        {error && error !== "__EMPTY__" && (
          <div className="mt-4">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {data && (
          <div className="grid lg:grid-cols-[1fr_260px] gap-8 mt-3">
            <div>
              <PageTitle icon={entityTypeStyle(data.entity.type || type).icon} tone={entityTypeStyle(data.entity.type || type).tone} title={data.entity.name} />
              {data.entity.description && <p className="text-secondary mt-1">{data.entity.description}</p>}
              {data.entity.aliases.length > 0 && (
                <p className="text-sm text-secondary mt-1">Also known as {data.entity.aliases.join(", ")}</p>
              )}
              <div className="space-y-3 mt-6">
                {data.records.map((r) => (
                  <RecordCard key={r.id} record={r} />
                ))}
                {data.records.length === 0 && (
                  <EmptyContribute
                    title="No verified records on this page yet"
                    detail="Contribute what you know about this person or place so it can appear here after verification."
                  />
                )}
              </div>
            </div>
            <aside className="space-y-8">
              {data.related.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-secondary uppercase tracking-wide">Related</h2>
                  <div className="flex flex-wrap gap-2">
                    {data.related.map((r) => (
                      <Chip key={r.id} href={entityHref(r)} title={`${r.shared} shared record(s)`}>
                        {r.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {/* Pins rail sits under Related on entity pages. */}
              <PinRail pins={pins} />
            </aside>
          </div>
        )}
      </Page>
    </div>
  );
}
