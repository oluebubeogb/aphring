"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { IconBubble } from "@/components/Colorful";

/** Empty / no-match state that steers people to Contribute instead of a dead end. */
export default function EmptyContribute({
  title = "Nothing verified here yet",
  detail = "Know something the network is missing? Add a record or document so others can find it after verification.",
  className = "",
}: {
  title?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface/80 px-4 py-5 space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <IconBubble icon={Upload} tone="orange" size="md" className="shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-primary">{title}</p>
          <p className="text-sm text-secondary">{detail}</p>
        </div>
      </div>
      <Link
        href="/submit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 dark:text-orange-300 hover:underline underline-offset-2"
      >
        Contribute missing knowledge →
      </Link>
    </div>
  );
}
