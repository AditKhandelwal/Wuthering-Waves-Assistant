import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// The agent is instructed (SYSTEM_PROMPT in the Edge Function) to answer in
// tables/bold/lists for scannability, but that's markdown *text* -- it was
// rendering as literal "**bold**"/"| a | b |" until this component parsed
// it. No @tailwindcss/typography plugin here (not already a dependency);
// styled directly per-element instead, matching this app's dark/gold theme
// tokens rather than a generic prose default.
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  h1: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-gold-soft first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-gold-soft first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 font-semibold text-gold-soft first:mt-0">{children}</h3>,
  code: ({ children }) => <code className="rounded-sm bg-panel-alt px-1 py-0.5 text-xs">{children}</code>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-gold-soft underline">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-panel-alt px-2 py-1 text-left font-semibold text-gold-soft">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}

const EXAMPLE_PROMPTS = [
  "What's my current roster?",
  "Is Carlotta's build ready for endgame?",
  "Who should I team with Jiyan?",
];

// Every request resends the full conversation so far (the Edge Function is
// stateless -- see agent.md), and each user question can itself trigger
// several chained tool-call round trips that each resend the growing
// message list again. A long chat's history was a real contributor to
// hitting Groq's daily token cap during testing. Capping to the most
// recent turns bounds that growth -- older context is simply dropped, no
// summarization, matching this app's existing "keep it simple" bias (see
// architecture.md's "Roster IS the memory" -- cross-session state already
// lives in the DB, not the chat transcript, so losing old chat turns isn't
// losing real data).
const MAX_HISTORY_MESSAGES = 8;

export function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    setError(null);
    setInput("");

    const history = messages.slice(-MAX_HISTORY_MESSAGES);
    setMessages((cur) => [...cur, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            assistantText += delta;
            setMessages((cur) => {
              const next = [...cur];
              next[next.length - 1] = { role: "assistant", content: assistantText };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setMessages((cur) => cur.slice(0, -1)); // drop the empty assistant placeholder
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-53px)] max-w-3xl flex-col px-8 py-10">
      <h1 className="mb-6 shrink-0 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Chat
      </h1>

      {authLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : !user ? (
        <p className="text-sm text-text-muted">
          Sign in to ask the build advisor about your roster, builds, and team comps.
        </p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-text-muted">
                  Ask about your saved builds, echo choices, or team comps -- the advisor reads your
                  actual roster and compares it against Kuro's recommended builds.
                </p>
                <div className="flex flex-col gap-2">
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="w-fit rounded-sm border border-border px-3 py-1.5 text-left text-xs text-text-muted transition hover:border-gold-soft hover:text-gold-soft"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[80%] rounded-sm border border-gold-soft/40 bg-panel-alt px-3 py-2 text-sm text-text">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="w-full rounded-sm border border-border bg-panel px-3 py-2 text-sm text-text">
                  {m.content ? (
                    <MarkdownMessage content={m.content} />
                  ) : sending && i === messages.length - 1 ? (
                    <span className="text-text-muted">Thinking...</span>
                  ) : null}
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="mt-3 shrink-0 text-xs text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="mt-4 flex shrink-0 gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your builds..."
              disabled={sending}
              className="flex-1 rounded-sm border border-border bg-panel-alt px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-gold-soft focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-sm border border-gold-soft px-4 py-2 text-xs uppercase tracking-widest text-gold-soft transition hover:bg-panel-alt disabled:opacity-50"
            >
              {sending ? "..." : "Send"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
