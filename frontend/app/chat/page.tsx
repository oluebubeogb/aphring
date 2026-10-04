"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Send, Menu, X, BookOpen } from "lucide-react";
import { api, isLoggedIn, clearToken } from "@/lib/api";
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

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    loadChats();
  }, []);

  useEffect(() => {
    if (initialQ && isLoggedIn() && !startedRef.current) {
      startedRef.current = true;
      startWithQuestion(initialQ);
    }
  }, [initialQ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadChats() {
    try {
      const data = await api<Chat[]>("/api/chats");
      setChats(data);
    } catch {
      clearToken();
      router.push("/login");
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
      const res = await api<{ message: Message }>(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((m) => [
        ...m.filter((x) => x.id !== tempUser.id),
        { ...tempUser, id: "user-" + Date.now() },
        res.message,
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
      {/* Sidebar */}
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
            Communities
          </Link>
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-secondary"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm text-secondary truncate">
            {activeChat
              ? chats.find((c) => c.id === activeChat)?.title || "Chat"
              : "New conversation"}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChat && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <h2 className="text-2xl font-semibold">Ask Aphring</h2>
              <p className="text-secondary max-w-md">
                Answers come only from verified community knowledge. No
                hallucinations.
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
