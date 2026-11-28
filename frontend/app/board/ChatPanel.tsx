import { Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board } from "./model";
import styles from "./chat.module.css";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

// Failed turns save nothing on the server (see backend/chat.py), so every failure can be retried.
const failures: Record<string, string> = {
  stale: "The board changed while the assistant was replying, so nothing was applied. Send the message again.",
  reply: "The assistant's reply could not be used, so nothing changed. Try again.",
  configuration: "The assistant is not set up on the server.",
};
const unreachable = "The assistant could not reply. Try again in a moment.";

export function ChatPanel({ onSignedOut, onBoard, onStale }: {
  onSignedOut: () => void;
  onBoard: (board: Board) => void;
  onStale: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ notice: string; message: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; });

  const load = useCallback(() => fetch("/api/chat", { cache: "no-store" }).then(async (response) => {
    if (response.status === 401) return signedOut.current();
    if (!response.ok) throw new Error(`GET /api/chat returned ${response.status}`);
    setMessages((await response.json()).messages);
  }).catch(() => setLoadFailed(true)), []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending !== null) return;
    setPending(message);
    setFailure(null);
    setDraft("");
    const fail = (notice: string) => {
      setFailure({ notice, message });
      setDraft((current) => current || message);
    };
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (response.status === 401) return signedOut.current();
      const body = await response.json().catch(() => null);
      // A stale turn means the board changed elsewhere, so show the current one before a retry.
      if (body?.kind === "stale") onStale();
      if (!response.ok) return fail(failures[body?.kind] ?? unreachable);
      setMessages((current) => [...(current ?? []), ...body.messages]);
      onBoard(body.board);
    } catch {
      fail(unreachable);
    } finally {
      setPending(null);
    }
  }

  return (
    <aside aria-labelledby="chat-title" className={styles.panel}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.badge}><Sparkles size={16} aria-hidden="true" /></span>
          <div>
            <h2 id="chat-title">Assistant</h2>
            <p>Ask about the board or request card changes.</p>
          </div>
        </div>
        {loadFailed && (
          <div role="alert" className={styles.notice}>
            <p>The conversation could not be loaded.</p>
            <button type="button" onClick={() => { setLoadFailed(false); void load(); }}>Try again</button>
          </div>
        )}
        <div ref={log} role="log" aria-label="Conversation" className={styles.log} tabIndex={0}>
          {messages === null && !loadFailed && <p className={styles.empty}>Loading conversation…</p>}
          {messages?.length === 0 && pending === null && (
            <p className={styles.empty}>Try “Move the homepage card to Review” or “What is still in the backlog?”</p>
          )}
          <ol>
            {messages?.map((message) => (
              <li key={message.id} className={styles.message} data-role={message.role}>
                <span className={styles.author}>{message.role === "user" ? "You" : "Assistant"}</span>
                <p>{message.content}</p>
              </li>
            ))}
            {pending !== null && (
              <li className={styles.message} data-role="user" data-pending="true">
                <span className={styles.author}>You</span>
                <p>{pending}</p>
              </li>
            )}
          </ol>
        </div>
        {pending !== null && <p role="status" className={styles.status}>Assistant is replying…</p>}
        {failure && (
          <div role="alert" className={styles.notice}>
            <p>{failure.notice}</p>
            <button type="button" onClick={() => void send(failure.message)}>Try again</button>
          </div>
        )}
        <form className={styles.composer} aria-label="Message the assistant" onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}>
          <label htmlFor="chat-message">Message</label>
          <textarea
            id="chat-message"
            rows={3}
            value={draft}
            aria-describedby="chat-tip"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <div className={styles.actions}>
            <p id="chat-tip">Enter to send, Shift+Enter for a new line</p>
            <button type="submit" disabled={!draft.trim() || pending !== null || messages === null}>
              <Send size={15} aria-hidden="true" /> Send
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
