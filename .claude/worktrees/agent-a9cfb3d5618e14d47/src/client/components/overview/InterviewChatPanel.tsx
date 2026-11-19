import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  X,
  CheckCircle2,
  MessageSquareText,
  AlertCircle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface DetectedSection {
  sectionKey: string;
  content: string;
  heading: string;
}

interface InterviewChatPanelProps {
  draftId: string;
  /** Called with section content when user approves; component does not mutate the editor itself. */
  onApproveSection: (sectionKey: string, content: string, heading: string) => void;
  onClose: () => void;
}

const SECTION_KEY_TO_HEADING: Record<string, string> = {
  problem: 'Problem',
  overview: 'Overview',
  goals: 'Goals',
  'primary-users': 'Primary Users',
  constraints: 'Constraints',
  'success-criteria': 'Success Criteria',
  notes: 'Notes',
};

// Accept both ```section:KEY (canonical) and ```KEY (looser, what some models
// produce). Reject normal language fences (```js / ```python) by gating on
// known section keys.
const SECTION_FENCE_RE = /```(?:section:)?([a-z][a-z0-9-]*)\n([\s\S]*?)\n```/gi;
const KNOWN_SECTION_KEYS = new Set(Object.keys(SECTION_KEY_TO_HEADING));

function detectSections(text: string): DetectedSection[] {
  const out: DetectedSection[] = [];
  SECTION_FENCE_RE.lastIndex = 0;
  for (const match of text.matchAll(SECTION_FENCE_RE)) {
    const sectionKey = (match[1] || '').toLowerCase();
    if (!KNOWN_SECTION_KEYS.has(sectionKey)) continue;
    const content = (match[2] || '').trim();
    const heading = SECTION_KEY_TO_HEADING[sectionKey] || sectionKey;
    out.push({ sectionKey, content, heading });
  }
  return out;
}

function nextId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function InterviewChatPanel({
  draftId,
  onApproveSection,
  onClose,
}: InterviewChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedSectionKeys, setApprovedSectionKeys] = useState<Set<string>>(
    new Set(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  // Auto-scroll on new content. Use scrollIntoView on a sentinel + RAF to
  // ensure the layout has settled (matters during streaming when the latest
  // assistant message grows token-by-token).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, streaming]);

  const sendTurn = async (userText: string, kickoff = false) => {
    setError(null);
    setStreaming(true);

    // Append user message immediately (skip when kickoff with empty content)
    if (!(kickoff && !userText)) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content: userText },
      ]);
    }

    // Insert empty assistant placeholder we'll fill in via streaming
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/overview/draft/${draftId}/ai-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: userText, kickoff }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Stream failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE events: "event: NAME\ndata: JSON\n\n"
        let sepIdx;
        while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);
          let eventName = 'message';
          let dataLine = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7);
            else if (line.startsWith('data: ')) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine) as {
              delta?: string;
              error?: string;
            };
            if (eventName === 'chunk' && payload.delta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + payload.delta! }
                    : m,
                ),
              );
            } else if (eventName === 'error' && payload.error) {
              throw new Error(payload.error);
            }
            // 'done' / 'heartbeat' need no UI action here
          } catch (parseErr) {
            // Bubble up any thrown error from the chunk handler
            if (parseErr instanceof Error && parseErr.message !== 'JSON.parse')
              throw parseErr;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled
      } else {
        setError(err instanceof Error ? err.message : 'Stream failed');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  // Hydrate transcript on mount, then kickoff if empty
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/overview/draft/${draftId}/transcript`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
        };
        if (cancelled) return;
        if (data.messages.length === 0) {
          await sendTurn('', true);
        } else {
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            })),
          );
        }
      } catch {
        // ignore — start fresh
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Detect approve keyword (A, [A], [A]pprove, approve — case-insensitive,
    // optionally followed by the section name). When matched, find the most
    // recent unapproved section in the latest assistant message and run the
    // same insert + save flow as the button click.
    const isApproveKeyword = /^\[?a\]?(pprove)?\b/i.test(text);
    if (isApproveKeyword) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg || msg.role !== 'assistant') continue;
        const sections = detectSections(msg.content);
        const unapproved = sections.find((s) => !approvedSectionKeys.has(s.sectionKey));
        if (unapproved) {
          onApproveSection(unapproved.sectionKey, unapproved.content, unapproved.heading);
          setApprovedSectionKeys((prev) => {
            const next = new Set(prev);
            next.add(unapproved.sectionKey);
            return next;
          });
          break;
        }
      }
    }

    setInput('');
    void sendTurn(text);
  };

  const handleApprove = (_m: ChatMessage, section: DetectedSection) => {
    onApproveSection(section.sectionKey, section.content, section.heading);
    setApprovedSectionKeys((prev) => {
      const next = new Set(prev);
      next.add(section.sectionKey);
      return next;
    });
    // Acknowledge in chat as a user "approve" message
    void sendTurn(`[A]pprove ${section.heading}`);
  };

  return (
    <aside
      className="flex flex-col h-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      aria-label="Business analyst interview"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            BA Interview
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close interview"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-gray-500 dark:text-gray-400 italic">
            Starting interview…
          </p>
        )}
        {messages.map((m) => {
          const sections = m.role === 'assistant' ? detectSections(m.content) : [];
          return (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 ml-6'
                  : 'rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 mr-6'
              }
            >
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                {m.role === 'user' ? 'You' : 'BA'}
              </p>
              <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {m.content.length > 2000
                  ? `${m.content.slice(0, 1500)}\n\n… (${m.content.length.toLocaleString()} chars — truncated for display)`
                  : m.content || (m.role === 'assistant' && streaming ? '…' : '')}
              </div>
              {sections.map((s) => {
                const alreadyApproved = approvedSectionKeys.has(s.sectionKey);
                return (
                  <div
                    key={s.sectionKey}
                    className="mt-2 rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/20 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
                      Proposed: {s.heading}
                    </p>
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans mb-2">
                      {s.content}
                    </pre>
                    <button
                      type="button"
                      onClick={() => handleApprove(m, s)}
                      disabled={streaming || alreadyApproved}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {alreadyApproved ? 'Approved' : `[A]pprove → insert into editor`}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {streaming && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            BA is thinking…
          </div>
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {error && (
        <div className="border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            streaming
              ? 'Wait for BA…'
              : 'Reply, or use [A]pprove / [C]hange / [E]xplain / [Add] …'
          }
          disabled={streaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
        >
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </aside>
  );
}
