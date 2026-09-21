"use client";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, X, Send, Trash2 } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";

const STARTERS = [
  "Summarize the current view",
  "Which 10 institutes score lowest?",
  "What drives the score the most?",
  "Which region has the highest dropout?",
];

export function ChatWidget() {
  const { filters, hasFilters, activeCount } = useFilters();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat/" }));
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({ transport });
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const waiting = busy && (!last || last.role === "user" || !last.parts.some((p) => p.type === "text" && p.text));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status, open]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t }, { body: { filters } }); // current dashboard filters travel with every question
    setInput("");
  };

  return (
    <div className="no-print">
      {open && (
        <div className="fixed bottom-20 right-4 z-[60] flex h-[min(78vh,36rem)] w-[min(94vw,26rem)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[var(--text)]">Data assistant</div>
              <div className="truncate text-[11px] text-[var(--text-muted)]">
                {hasFilters ? `Using your current filters (${activeCount})` : "Using all data"}
              </div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} aria-label="Clear chat" className="rounded-md p-1.5 hover:bg-[var(--surface-3)]">
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-md p-1.5 hover:bg-[var(--surface-3)]">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[12px] text-[var(--text-muted)]">Ask about institutes, regions, trades, scores or attendance.</p>
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="block w-full rounded-md border border-[var(--border)] px-3 py-2 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-3)]">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              if (!text) return null;
              return (
                <div key={m.id}
                  className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === "user" ? "ml-auto bg-brand-600 text-white" : "bg-[var(--surface-3)] text-[var(--text)]"}`}>
                  {text}
                </div>
              );
            })}

            {waiting && <div className="text-[12px] text-[var(--text-muted)]">Analysing the data…</div>}
            {error && <div className="text-[12px] text-red-500">{error.message}</div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t border-[var(--border)] p-2.5">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-brand-600" />
            {busy ? (
              <button type="button" onClick={stop} className="rounded-md bg-[var(--surface-3)] px-3 py-2 text-[12px]">Stop</button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send"
                className="rounded-md bg-brand-600 p-2 text-white disabled:opacity-40">
                <Send size={15} />
              </button>
            )}
          </form>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close chat" : "Open data assistant"}
        className="fixed bottom-4 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:opacity-90">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </div>
  );
}