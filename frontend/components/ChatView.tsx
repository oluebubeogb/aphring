"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Send, Menu, X, Compass, Copy, Check, ThumbsUp, ThumbsDown, Rss, User, LayoutDashboard, Moon, Sun, LogOut, Sparkles, LogIn, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconBubble, TONES } from "@/components/Colorful";
import EmptyContribute from "@/components/EmptyContribute";
import { api, isLoggedIn, clearToken, isStaff, getStoredUser } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { BrandMark } from "@/components/ui";
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
const SIDEBAR_KEY = "aphring-chat-sidebar-collapsed";
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
  // Desktop: chat-history sidebar can be collapsed; remembered in localStorage.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);
  const toggleCollapsed = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {}
  };
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
    <div className="h-screen flex">
      {/* Sidebar (signed-in only: guests have no saved history) */}
      {guest === false && (
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:hidden" : ""} fixed md:static z-30 w-64 shrink-0 h-full border-r border-border bg-surface flex flex-col transition-transform`}
      >
        <div className="p-4 flex items-center justify-between border-b border-border">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <BrandMark />
            <span className="text-primary">aphring</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-secondary"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={() => toggleCollapsed(true)}
            className="hidden md:inline-flex group text-secondary hover:text-primary"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <IconBubble icon={PanelLeftClose} tone="slate" size="sm" className="nav-bubble transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newChat}
            className="group w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-border text-sm font-medium hover:bg-background hover:border-violet-300 dark:hover:border-violet-500/40 hover:shadow-sm transition"
          >
            <IconBubble icon={Plus} tone="violet" size="sm" className="transition-transform duration-300 group-hover:rotate-90" />
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
              className={`group flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-sm transition duration-200 hover:translate-x-0.5 ${
                activeChat === c.id
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200"
                  : "text-secondary hover:bg-background hover:text-primary"
              }`}
            >
              <IconBubble
                icon={MessageSquare}
                tone={activeChat === c.id ? "violet" : "slate"}
                size="xs"
                className={`shrink-0 ${activeChat === c.id ? "" : "opacity-70 group-hover:opacity-100"}`}
              />
              <span className="truncate">{c.title}</span>
            </Link>
          ))}
        </div>

        <div className="p-3 border-t border-border space-y-0.5 text-sm">
          <Link href="/explore" className="side-link group">
            <IconBubble icon={Compass} tone="emerald" size="sm" className="nav-bubble" />
            Explore
          </Link>
          <Link href="/feed" className="side-link group">
            <IconBubble icon={Rss} tone="sky" size="sm" className="nav-bubble" />
            Feed
          </Link>
          <Link href="/me" className="side-link group">
            <IconBubble icon={User} tone="teal" size="sm" className="nav-bubble" />
            My profile
          </Link>
          {staff && (
            <Link href="/workstation" className="side-link group">
              <IconBubble icon={LayoutDashboard} tone="slate" size="sm" className="nav-bubble" />
              Workstation
            </Link>
          )}
          <button onClick={toggle} className="side-link group w-full text-left">
            <IconBubble icon={theme === "light" ? Moon : Sun} tone={theme === "light" ? "indigo" : "yellow"} size="sm" className="nav-bubble group-hover:rotate-12" />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            onClick={() => {
              clearToken();
              router.push("/");
            }}
            className="side-link group w-full text-left"
          >
            <IconBubble icon={LogOut} tone="rose" size="sm" className="nav-bubble" />
            Sign out
          </button>
        </div>
      </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3">
          {guest ? (
            <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
              <BrandMark />
              <span className="text-primary">aphring</span>
            </Link>
          ) : (
            <>
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-secondary"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              {collapsed && (
                <button
                  onClick={() => toggleCollapsed(false)}
                  className="hidden md:inline-flex group text-secondary hover:text-primary"
                  title="Show chats"
                  aria-label="Show chats sidebar"
                >
                  <IconBubble icon={PanelLeftOpen} tone="violet" size="sm" className="nav-bubble transition-transform duration-200 group-hover:scale-110" />
                </button>
              )}
            </>
          )}
          <span className="text-sm text-secondary truncate flex-1">
            {guest ? "Ask as a guest" : activeChat
              ? chats.find((c) => c.id === activeChat)?.title || "Chat"
              : "New conversation"}
          </span>
          {guest && (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/explore" className="nav-link group text-secondary hover:text-primary">
                <IconBubble icon={Compass} tone="emerald" size="sm" className="nav-bubble" />
                <span className="hidden sm:inline">Explore</span>
              </Link>
              <Link
                href={`/login?next=/chat${activeChat ? `/${activeChat}` : ""}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-background hover:opacity-90 hover:-translate-y-0.5 transition"
              >
                <LogIn className="w-4 h-4" /> Sign in
              </Link>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {loadingChat && messages.length === 0 && (
            <p className="text-center text-sm text-secondary">Loading conversation…</p>
          )}
          {!activeChat && !loadingChat && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 animate-fade-up">
              <IconBubble icon={Sparkles} tone="violet" size="lg" className="animate-float-soft" />
              <h2 className="text-2xl font-semibold">
                Ask{" "}
                <span className="text-primary">
                  Aphring
                </span>
              </h2>
              <p className="text-secondary max-w-md">
                Answers come only from verified records, with links to each source.
                If something is missing, Aphring will invite you to Contribute what you know.
              </p>
            </div>
          )}

          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2 animate-fade-up ${
                  m.role === "USER" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "ASSISTANT" && (
                  <IconBubble icon={Sparkles} tone={m.error ? "rose" : "violet"} size="sm" className="shrink-0 mt-1" />
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "USER"
                      ? "bg-slate-800 text-white dark:bg-white/10 dark:text-white dark:border dark:border-white/10 shadow-sm"
                      : m.error
                        ? "bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/25 dark:text-rose-200"
                        : "bg-surface/80 border border-border text-primary"
                  }`}
                >
                  {m.content}
                  {m.role === "ASSISTANT" && !m.error && (!m.sources || m.sources.length === 0) && /nothing verified in aphring covers|no verified information about this topic/i.test(m.content) && (
                    <div className="mt-3 whitespace-normal">
                      <EmptyContribute
                        title="Help fill this gap"
                        detail="Your contribution goes to review. Once verified, Ask and Explore can use it."
                      />
                    </div>
                  )}
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
                          className="text-xs px-2 py-0.5 rounded-full border max-w-full truncate transition duration-200 hover:-translate-y-0.5 hover:shadow-sm bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25"
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
                        className="group h-7 inline-flex items-center gap-1 rounded-full text-xs transition"
                      >
                        <span className={`icon-bubble w-7 h-7 transition duration-200 group-hover:scale-110 ${copiedId === m.id ? TONES.green.bubble : TONES.blue.bubble}`}>
                          {copiedId === m.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </span>
                        {copiedId === m.id && <span className={`${TONES.green.text} animate-fade-in`}>Copied</span>}
                      </button>
                      {guest === false && !m.local && (
                        <>
                          <button
                            type="button"
                            onClick={() => vote(m, "UP")}
                            title="Good answer"
                            aria-label="Good answer"
                            aria-pressed={m.myVote === "UP"}
                            className={`icon-bubble w-7 h-7 transition duration-200 hover:scale-110 ${TONES.green.bubble} ${
                              m.myVote === "UP" ? `ring-2 ${TONES.green.ring}` : ""
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
                            className={`icon-bubble w-7 h-7 transition duration-200 hover:scale-110 ${TONES.rose.bubble} ${
                              m.myVote === "DOWN" ? `ring-2 ${TONES.rose.ring}` : ""
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
              <div className="flex justify-start gap-2 animate-fade-up">
                <IconBubble icon={Sparkles} tone="violet" size="sm" className="shrink-0 mt-1 animate-pulse" />
                <div className="bg-surface border border-border rounded-2xl px-4 py-3 text-sm text-secondary inline-flex items-center gap-2">
                  <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
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
              className="flex-1 h-12 px-4 rounded-xl border border-border bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 dark:focus:border-violet-500/40 transition"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-12 w-12 flex items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 transition dark:bg-violet-500 dark:hover:bg-violet-400"
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
