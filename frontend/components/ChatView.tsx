"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Send, Menu, X, BookOpen, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { api, isLoggedIn, clearToken, isStaff, getStoredUser } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import SourceOverlay, { type SourceRef } from "@/components/SourceOverlay";

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  sources?: SourceRef[];
  /** Signed-in assistant answers only. */
  myVote?: "UP" | "DOWN" | null;
  /** Local-only bubble (guest answer, error): not saved, so it can't be voted on. */
  local?: boolean;
  error?: boolean;
}

type JobStatus = "pending" | "done" | "error";
interface JobResponse {
  status?: JobStatus;
  jobId?: string;
  error?: string;
  answer?: string;
  message?: Message;
  sources?: Message["sources"];
  /** Chat title after this answer; `titlePending` = the AI title is still being written. */
  title?: string;
  titlePending?: boolean;
}

const POLL_MS = 1500;
const POLL_MAX_MS = 3 * 60 * 1000;

/** Ask answers in the background (RunPod can take 1–2 min); poll the job until it finishes. */
async function waitForJob(first: JobResponse, pollPath: (jobId: string) => string): Promise<JobResponse> {
  if (first.status !== "pending" || !first.jobId) return first;
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let job: JobResponse;
    try {
      job = await api<JobResponse>(pollPath(first.jobId));
    } catch (err: any) {
      // Brief gateway blips while polling shouldn't kill the wait; a 404 means the job is gone.
      if (err?.status === 404) throw err;
      continue;
    }
    if (job.status === "error") throw new Error(job.error || "The AI couldn't answer. Please try again.");
    if (job.status === "done") return job;
  }
  throw new Error("The AI is taking longer than usual. Please try again in a minute.");
}

const TITLE_POLL_MAX_MS = 30 * 1000;

/** Copy text to the clipboard (falls back to a hidden textarea on older browsers / http). */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/**
 * Ask UI shared by `/chat` (new conversation, guests) and `/chat/[id]` (a saved conversation).
 * The URL is the source of truth for the open chat, so a refresh keeps you in it.
 */
export default function ChatView({ chatId }: { chatId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggle } = useTheme();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(chatId ?? null);
  const [loadingChat, setLoadingChat] = useState(Boolean(chatId));
  const [overlay, setOverlay] = useState<{ source: SourceRef; index: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialQ = searchParams.get("q");
  const startedRef = useRef(false);
  const [staff, setStaff] = useState(false);
  // null = not known yet (first render), true = signed out visitor asking without an account.
  const [guest, setGuest] = useState<boolean | null>(null);
  useEffect(() => setStaff(isStaff(getStoredUser())), []);

  useEffect(() => {
    const signedIn = isLoggedIn();
    setGuest(!signedIn);
    if (signedIn) loadChats();
    else if (chatId) router.replace(`/login?next=/chat/${chatId}`);
  }, []);

  // Permalink: load the chat named in the URL (owned chats only; anything else goes back to /chat).
  useEffect(() => {
    if (!chatId || !isLoggedIn()) return;
    let alive = true;
    setLoadingChat(true);
    api<{ messages: Message[] }>(`/api/chats/${chatId}`)
      .then((chat) => {
        if (!alive) return;
        setActiveChat(chatId);
        setMessages(chat.messages);
      })
      .catch((err) => {
        if (!alive) return;
        if (err?.status === 401) router.replace(`/login?next=/chat/${chatId}`);
        else router.replace("/chat");
      })
      .finally(() => alive && setLoadingChat(false));
    return () => {
      alive = false;
    };
  }, [chatId]);

  /** Show /chat/:id in the address bar without remounting mid-answer (e.g. a chat created on first send). */
  function showChatUrl(id: string) {
    if (typeof window !== "undefined" && window.location.pathname !== `/chat/${id}`) {
      window.history.replaceState(null, "", `/chat/${id}`);
    }
  }

  function applyTitle(id: string, title?: string) {
    if (!title) return;
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  /** The AI title is written just after the answer; poll the finished job briefly to pick it up. */
  async function followTitle(jobId: string, id: string) {
    const deadline = Date.now() + TITLE_POLL_MAX_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const job = await api<JobResponse>(`/api/chats/jobs/${jobId}`);
        if (!job.titlePending) {
          applyTitle(id, job.title);
          return;
        }
      } catch (err: any) {
        if (err?.status === 404) return;
      }
    }
  }

  useEffect(() => {
    if (guest === null || !initialQ || startedRef.current) return;
    startedRef.current = true;
    if (guest) sendGuest(initialQ);
    else startWithQuestion(initialQ);
  }, [initialQ, guest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadChats() {
    try {
      const data = await api<Chat[]>("/api/chats");
      setChats(data);
    } catch {
      // Session expired: fall back to guest mode instead of bouncing to the login page.
      clearToken();
      setGuest(true);
    }
  }

  /** Signed-out Ask: one-off answers, kept only in this tab (nothing is saved on the server). */
  async function sendGuest(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setLoading(true);
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: "g-user-" + Date.now(), role: "USER", content, createdAt: now }]);
    try {
      const first = await api<JobResponse>("/api/chats/ask", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const res = await waitForJob(first, (jobId) => `/api/chats/ask/jobs/${jobId}`);
      setMessages((m) => [
        ...m,
        { id: "g-ai-" + Date.now(), role: "ASSISTANT", content: res.answer || "", createdAt: new Date().toISOString(), sources: res.sources, local: true },
      ]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { id: "g-err-" + Date.now(), role: "ASSISTANT", content: err.message || "Something went wrong.", createdAt: new Date().toISOString(), local: true, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startWithQuestion(q: string) {
    const chat = await api<{ id: string }>("/api/chats", { method: "POST" });
    setActiveChat(chat.id);
    showChatUrl(chat.id); // drops ?q= so a refresh doesn't ask again
    setMessages([]);
    await sendMessage(q, chat.id);
    loadChats();
  }

  /** New conversation: the chat itself is created on the first question (no empty chats piling up). */
  function newChat() {
    setActiveChat(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    router.push("/chat");
  }

  async function vote(m: Message, type: "UP" | "DOWN") {
    const prev = m.myVote ?? null;
    const optimistic = prev === type ? null : type;
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, myVote: optimistic } : x)));
    try {
      const r = await api<{ myVote: "UP" | "DOWN" | null }>(`/api/chats/messages/${m.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, myVote: r.myVote } : x)));
    } catch {
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, myVote: prev } : x)));
    }
  }

  async function copy(m: Message) {
    await copyText(m.content);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
  }

  async function sendMessage(text?: string, chatId?: string) {
    if (guest) return sendGuest(text);
    const content = (text ?? input).trim();
    let id = chatId || activeChat;

    if (!content || loading) return;

    // Create chat on the fly if needed
    if (!id) {
      const chat = await api<{ id: string }>("/api/chats", { method: "POST" });
      id = chat.id;
      setActiveChat(id);
      showChatUrl(id);
      setChats((cs) => [{ id: chat.id, title: content.slice(0, 60), updatedAt: new Date().toISOString() }, ...cs]);
    }

    setInput("");
    setLoading(true);

    const tempUser: Message = {
      id: "temp-user-" + Date.now(),
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUser]);

    try {
      const first = await api<JobResponse>(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const res = await waitForJob(first, (jobId) => `/api/chats/jobs/${jobId}`);
      if (!res.message) throw new Error("The AI couldn't answer. Please try again.");
      const answer = res.message;
      setMessages((m) => [
        ...m.filter((x) => x.id !== tempUser.id),
        { ...tempUser, id: "user-" + Date.now() },
        { ...answer, sources: res.sources, myVote: answer.myVote ?? null },
      ]);
      await loadChats();
      applyTitle(id, res.title);
      if (res.titlePending && first.jobId) followTitle(first.jobId, id);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        {
          id: "err-" + Date.now(),
          role: "ASSISTANT",
          content: err.message || "Something went wrong.",
          createdAt: new Date().toISOString(),
          local: true,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar (signed-in only: guests have no saved history) */}
      {guest === false && (
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static z-30 w-64 h-full border-r border-border bg-surface flex flex-col transition-transform`}
      >
        <div className="p-4 flex items-center justify-between border-b border-border">
          <Link href="/" className="font-semibold tracking-tight">
            aphring
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-background transition"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          <p className="text-xs text-secondary px-2 py-1 uppercase tracking-wide">
            Recent
          </p>
          {chats.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              onClick={() => setSidebarOpen(false)}
              title={c.title}
              aria-current={activeChat === c.id ? "page" : undefined}
              className={`block w-full text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                activeChat === c.id
                  ? "bg-background text-primary"
                  : "text-secondary hover:bg-background"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 inline mr-2 opacity-60" />
              {c.title}
            </Link>
          ))}
        </div>

        <div className="p-3 border-t border-border space-y-1 text-sm">
          <Link
            href="/explore"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-secondary hover:bg-background transition"
          >
            <BookOpen className="w-4 h-4" />
            Explore
          </Link>
          <Link href="/feed" className="flex items-center gap-2 px-3 py-2 rounded-lg text-secondary hover:bg-background transition">
            Feed
          </Link>
          <Link href="/me" className="flex items-center gap-2 px-3 py-2 rounded-lg text-secondary hover:bg-background transition">
            My profile
          </Link>
          {staff && (
            <Link href="/workstation" className="flex items-center gap-2 px-3 py-2 rounded-lg text-secondary hover:bg-background transition">
              Workstation
            </Link>
          )}
          <button
            onClick={toggle}
            className="w-full text-left px-3 py-2 rounded-lg text-secondary hover:bg-background transition"
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            onClick={() => {
              clearToken();
              router.push("/");
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-secondary hover:bg-background transition"
          >
            Sign out
          </button>
        </div>
      </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3">
          {guest ? (
            <Link href="/" className="font-semibold tracking-tight">
              aphring
            </Link>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-secondary"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <span className="text-sm text-secondary truncate flex-1">
            {guest ? "Ask as a guest" : activeChat
              ? chats.find((c) => c.id === activeChat)?.title || "Chat"
              : "New conversation"}
          </span>
          {guest && (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/explore" className="text-secondary hover:text-primary">Explore</Link>
              <Link href={`/login?next=/chat${activeChat ? `/${activeChat}` : ""}`} className="px-3 py-1.5 rounded-lg bg-accent text-background">Sign in</Link>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {loadingChat && messages.length === 0 && (
            <p className="text-center text-sm text-secondary">Loading conversation…</p>
          )}
          {!activeChat && !loadingChat && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <h2 className="text-2xl font-semibold">Ask Aphring</h2>
              <p className="text-secondary max-w-md">
                Answers come only from verified records, with links to each
                source. If nothing verified matches, Aphring says so.
              </p>
            </div>
          )}

          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "USER" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "USER"
                      ? "bg-accent text-background"
                      : "bg-surface border border-border text-primary"
                  }`}
                >
                  {m.content}
                  {m.role === "ASSISTANT" && m.sources && m.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border flex flex-wrap gap-1.5 whitespace-normal">
                      <span className="text-xs text-secondary">Sources:</span>
                      {m.sources.map((s, i) => (
                        <a
                          key={`${s.id}-${i}`}
                          href={`/record/${s.id}`}
                          onClick={(e) => {
                            // Plain click previews in an overlay; ctrl/cmd/middle-click still opens the page.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            setOverlay({ source: s, index: i });
                          }}
                          className="text-xs px-2 py-0.5 rounded-full border border-border text-secondary hover:text-primary max-w-full truncate"
                        >
                          [{i + 1}] {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                  {m.role === "ASSISTANT" && !m.error && m.content && (
                    <div className="mt-2 -mb-1 flex items-center gap-1 whitespace-normal text-secondary">
                      <button
                        type="button"
                        onClick={() => copy(m)}
                        title="Copy answer"
                        aria-label="Copy answer"
                        className="h-7 px-1.5 inline-flex items-center gap-1 rounded-md text-xs hover:text-primary hover:bg-background transition"
                      >
                        {copiedId === m.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId === m.id && <span>Copied</span>}
                      </button>
                      {guest === false && !m.local && (
                        <>
                          <button
                            type="button"
                            onClick={() => vote(m, "UP")}
                            title="Good answer"
                            aria-label="Good answer"
                            aria-pressed={m.myVote === "UP"}
                            className={`h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-background transition ${
                              m.myVote === "UP" ? "text-accent" : "hover:text-primary"
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" fill={m.myVote === "UP" ? "currentColor" : "none"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => vote(m, "DOWN")}
                            title="Bad answer"
                            aria-label="Bad answer"
                            aria-pressed={m.myVote === "DOWN"}
                            className={`h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-background transition ${
                              m.myVote === "DOWN" ? "text-accent" : "hover:text-primary"
                            }`}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" fill={m.myVote === "DOWN" ? "currentColor" : "none"} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface border border-border rounded-2xl px-4 py-3 text-sm text-secondary">
                  Searching knowledge base…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border p-4">
          {guest && (
            <p className="max-w-2xl mx-auto mb-3 text-xs text-secondary">
              You&apos;re asking as a guest — answers aren&apos;t saved and there&apos;s a small hourly limit.{" "}
              <Link href={`/login?next=/chat${activeChat ? `/${activeChat}` : ""}`} className="underline hover:text-primary">Sign in</Link> or{" "}
              <Link href="/register" className="underline hover:text-primary">create an account</Link> to save your chats.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="max-w-2xl mx-auto flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about local history, leaders, places…"
              className="flex-1 h-12 px-4 rounded-xl border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/20"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-12 w-12 flex items-center justify-center rounded-xl bg-accent text-background disabled:opacity-40 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
      {overlay && <SourceOverlay source={overlay.source} index={overlay.index} onClose={closeOverlay} />}
    </div>
  );
}
