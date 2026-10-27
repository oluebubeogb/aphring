"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import EntityTile, { type ExploreEntity } from "@/components/EntityTile";
import { api } from "@/lib/api";
import { Notice, Page } from "@/components/ui";
import EmptyContribute from "@/components/EmptyContribute";
import { WithPinRail } from "@/components/PinRail";
import { entityTypeStyle } from "@/components/Colorful";
import { PageTitle } from "@/components/ui";

export default function ExploreTypePage() {
  const { type } = useParams<{ type: string }>();
  const [shelf, setShelf] = useState<{ label: string; total: number; entities: ExploreEntity[] } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api(`/api/explore/types/${type}`)
      .then(setShelf)
      .catch((e) => setError(e.message));
  }, [type]);

  const list = (shelf?.entities || []).filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="min-h-screen">
      <Header />
      <WithPinRail context={{ entityType: String(type || "").toUpperCase() }}>
      <Page wide>
        <Link href="/explore" className="text-sm text-secondary hover:text-primary">
          ← Explore
        </Link>
        <div className="mt-2 mb-6">
          <PageTitle icon={entityTypeStyle(type).icon} tone={entityTypeStyle(type).tone} title={shelf?.label || "Explore"} />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {shelf && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${shelf.total} entries…`}
              className="mb-6 w-full sm:w-80 h-10 px-3 rounded-lg border border-border bg-surface"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {list.map((e) => (
                <EntityTile key={e.id} e={e} />
              ))}
            </div>
            {list.length === 0 && (
              <div className="mt-6">
                <EmptyContribute
                  title="Nothing in this shelf matches yet"
                  detail="Contribute a verified record that belongs here, or clear the filter if you were searching."
                />
              </div>
            )}
          </>
        )}
      </Page>
      </WithPinRail>
    </div>
  );
}
