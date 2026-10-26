"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import ChatView from "@/components/ChatView";

/** Permalink for a saved conversation: a refresh reopens this chat (owner only). */
export default function ChatPermalinkPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-secondary">Loading…</div>}>
      <ChatView key={id} chatId={id} />
    </Suspense>
  );
}
