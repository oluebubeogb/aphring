"use client";

import { Suspense } from "react";
import ChatView from "@/components/ChatView";

/** New conversation (and guest Ask). The first question creates the chat and moves the URL to /chat/:id. */
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-secondary">Loading…</div>}>
      <ChatView />
    </Suspense>
  );
}
