import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadAgentSdk, type QueryFn } from "./sdk-loader";

// [SCOPE 102 / T003] BEGIN — BridgeSession: owns a driveable headless Claude session
// Wraps the Agent SDK `query()` with a push-based input queue (so the room can feed
// new user messages over time), routes the output stream to typed handler callbacks,
// and exposes interrupt/stop/resume. Runs in bypassPermissions so native prompts never
// freeze it (FR-005); git push is disallowed at the SDK level by default until the
// review-gated flow (FR-006 / T008) replaces it with a canUseTool gate.

type QueryHandle = ReturnType<QueryFn>;

/** A push-fed async iterable of user turns. Each push() is a new turn for the session. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private readonly buffered: SDKUserMessage[] = [];
  private readonly waiters: Array<(r: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    };
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: msg, done: false });
    else this.buffered.push(msg);
  }

  close(): void {
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter({ value: undefined as unknown as SDKUserMessage, done: true });
      waiter = this.waiters.shift();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    for (;;) {
      const next = this.buffered.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<SDKUserMessage>>((resolve) => this.waiters.push(resolve));
      if (result.done) return;
      yield result.value;
    }
  }
}

export interface BridgeSessionOptions {
  /** Working directory for the session's tools — the repo root. */
  cwd: string;
  /** Model override; omit to inherit the SDK/CLI default. */
  model?: string;
  /** Resume a prior session id (the GO REMOTE handoff, when resume is available). */
  resumeSessionId?: string;
  /** Seed text prepended as the first user turn (handoff fallback when resume can't be used). */
  seedContext?: string;
  /** Tool patterns to hard-block. Defaults to blocking `git push` (FR-006 safety default). */
  disallowedTools?: string[];
}

export interface BridgeSessionHandlers {
  onSessionInit(sessionId: string): void;
  onText(delta: string): void;
  onToolUse(name: string, summary: string): void;
  onAssistantDone(text: string): void;
  onResult(subtype: string, resultText?: string): void;
  onError(message: string): void;
}

export class BridgeSession {
  private handle?: QueryHandle;
  private readonly input = new InputQueue();
  private sessionId?: string;
  private running = false;

  constructor(
    private readonly opts: BridgeSessionOptions,
    private readonly handlers: BridgeSessionHandlers,
  ) {}

  get id(): string | undefined {
    return this.sessionId;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Feed a message from the room into the session (starts a turn when idle, steers when running). */
  send(text: string): void {
    this.input.push(text);
  }

  async start(): Promise<void> {
    const { query } = await loadAgentSdk();
    if (this.opts.seedContext && !this.opts.resumeSessionId) {
      this.input.push(`Context handed off from my desk session:\n\n${this.opts.seedContext}`);
    }
    this.handle = query({
      prompt: this.input,
      options: {
        cwd: this.opts.cwd,
        model: this.opts.model,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        resume: this.opts.resumeSessionId,
        disallowedTools: this.opts.disallowedTools ?? ["Bash(git push:*)"],
      },
    });
    this.running = true;
    void this.consume();
  }

  private async consume(): Promise<void> {
    if (!this.handle) return;
    try {
      for await (const msg of this.handle) {
        this.route(msg);
      }
    } catch (err) {
      this.handlers.onError(`session stream error — ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private route(msg: SDKMessage): void {
    if (msg.type === "system") {
      const init = msg as Extract<SDKMessage, { type: "system" }>;
      const sid = readSessionId(init);
      if (sid && !this.sessionId) {
        this.sessionId = sid;
        this.handlers.onSessionInit(sid);
      }
      return;
    }
    if (msg.type === "stream_event") {
      this.routeStreamEvent((msg as Extract<SDKMessage, { type: "stream_event" }>).event);
      return;
    }
    if (msg.type === "assistant") {
      const text = extractText((msg as Extract<SDKMessage, { type: "assistant" }>).message.content);
      if (text) this.handlers.onAssistantDone(text);
      return;
    }
    if (msg.type === "result") {
      const r = msg as Extract<SDKMessage, { type: "result" }>;
      const resultText = "result" in r && typeof r.result === "string" ? r.result : undefined;
      this.handlers.onResult(r.subtype, resultText);
      return;
    }
  }

  private routeStreamEvent(rawEvent: unknown): void {
    const ev = rawEvent as RawStreamEvent;
    if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && typeof ev.delta.text === "string") {
      this.handlers.onText(ev.delta.text);
      return;
    }
    if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
      this.handlers.onToolUse(ev.content_block.name ?? "tool", summarizeToolInput(ev.content_block));
    }
  }

  /** Interrupt the current turn (STOP) — keeps the session live for the next turn. */
  async interrupt(): Promise<void> {
    try {
      await this.handle?.interrupt();
    } catch {
      /* best-effort */
    }
  }

  async setModel(model?: string): Promise<void> {
    try {
      await this.handle?.setModel(model);
    } catch {
      /* best-effort */
    }
  }

  /** Fully tear the session down (CANCEL REMOTE). */
  stop(): void {
    this.running = false;
    try {
      this.handle?.close();
    } catch {
      /* ignore */
    }
    this.input.close();
    this.handle = undefined;
  }
}

// ── narrow shapes for the raw stream event (typed, no `any`) ─────────────────
interface RawStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
  content_block?: { type?: string; name?: string; input?: unknown };
}

function readSessionId(msg: Extract<SDKMessage, { type: "system" }>): string | undefined {
  const holder = msg as unknown as { session_id?: unknown };
  return typeof holder.session_id === "string" ? holder.session_id : undefined;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block && typeof block === "object") {
        const b = block as { type?: unknown; text?: unknown };
        if (b.type === "text" && typeof b.text === "string") return b.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function summarizeToolInput(block: { name?: string; input?: unknown }): string {
  const name = block.name ?? "tool";
  const input = block.input;
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const cmd = rec.command ?? rec.file_path ?? rec.path ?? rec.pattern ?? rec.url ?? rec.prompt;
    if (typeof cmd === "string") return `${name}: ${cmd.slice(0, 120)}`;
  }
  return name;
}
// [SCOPE 102 / T003] END
