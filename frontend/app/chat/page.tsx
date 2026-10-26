"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Send, Menu, X, BookOpen } from "lucide-react";
import { api, isLoggedIn, clearToken, isStaff, getStoredUser } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

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
  sources?: { id: string; title: string; type: string }[];
}

type JobStatus = "pending" | "done" | "error";
interface JobResponse {
  status?: JobStatus;
  jobId?: string;
  error?: string;
  answer?: string;
  message?: Message;
  sources?: Message["sources"];
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

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggle } = useTheme();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
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
  }, []);

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
        { id: "g-ai-" + Date.now(), role: "ASSISTANT", content: res.answer || "", createdAt: new Date().toISOString(), sources: res.sources },
      ]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { id: "g-err-" + Date.now(), role: "ASSISTANT", content: err.message || "Something went wrong.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startWithQuestion(q: string) {
    const chat = await api<{ id: string }>("/api/chats", { method: "POST" });
    setActiveChat(chat.id);
    setMessages([]);
    await sendMessage(q, chat.id);
    loadChats();
  }

  async function newChat() {
    const chat = await api<{ id: string }>("/api/chats", { method: "POST" });
    setActiveChat(chat.id);
    setMessages([]);
    setInput("");
    loadChats();
    setSidebarOpen(false);
  }

  async function openChat(id: string) {
    const chat = await api<{ messages: Message[] }>(`/api/chats/${id}`);
    setActiveChat(id);
    setMessages(chat.messages);
    setSidebarOpen(false);
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
        { ...answer, sources: res.sources },
      ]);
      loadChats();
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        {
          id: "err-" + Date.now(),
          role: "ASSISTANT",
          content: err.message || "Something went wrong.",
          createdAt: new Date().toISOString(),
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
            <button
              key={c.id}
              onClick={() => openChat(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                activeChat === c.id
                  ? "bg-background text-primary"
                  : "text-secondary hover:bg-background"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 inline mr-2 opacity-60" />
              {c.title}
            </button>
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
              <Link href="/login?next=/chat" className="px-3 py-1.5 rounded-lg bg-accent text-background">Sign in</Link>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChat && messages.length === 0 && (
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
                        <Link
                          key={s.id}
                          href={`/record/${s.id}`}
                          className="text-xs px-2 py-0.5 rounded-full border border-border text-secondary hover:text-primary"
                        >
                          [{i + 1}] {s.title}
                        </Link>
                      ))}
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
              <Link href="/login?next=/chat" className="underline hover:text-primary">Sign in</Link> or{" "}
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
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-secondary">
          Loading…
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
