import {
  YappchattClient,
  resolveYappchattConfig,
  type YappchattMessage,
  type YappchattStatus,
} from "../../../core/yappchatt";
import { BridgeSession } from "./session";
import { gitPush, gitTarget, runReview } from "./push-gate";

// [SCOPE 102 / T005] BEGIN — RemoteBridge: composes the room transport with the session
// Outbound relay (session -> room) is the handler set passed to BridgeSession; inbound
// routing (room -> session) is onRoomMessage. Connect announce on first 'connected'
// (FR-002), disconnect notice on shutdown (FR-009). Concise by default: assistant text
// and one line per tool call are posted; raw token deltas are held for a later VERBOSE.

export interface RemoteBridgeOptions {
  projectName: string;
  cwd: string;
  model?: string;
  /** Handoff context prepended as the first turn when we can't resume by id (FR-001). */
  seedContext?: string;
  /** Resume a prior session id instead of starting fresh (GO REMOTE handoff). */
  resumeSessionId?: string;
}

export class RemoteBridge {
  private readonly client: YappchattClient;
  private session?: BridgeSession;
  private announced = false;
  private tornDown = false;
  // Since YappChatt spec 091, Claude posts as a distinct agent user (isagent), so the
  // primary way we drop our own echoes is that flag (see onRoomMessage). selfPosts is a
  // best-effort fallback: we remember exactly what the bridge posted and drop those
  // echoes too, covering any legacy same-identity message the read session still sees.
  private readonly selfPosts: Array<{ text: string; at: number }> = [];
  private verbose = false;
  private turnActive = false;
  private pendingPush?: { remote: string; branch: string };
  private verboseBuffer = "";
  private verboseTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly opts: RemoteBridgeOptions) {
    const { config, user } = resolveYappchattConfig();
    this.client = new YappchattClient(config, user, {
      onStatus: (s, d) => this.onStatus(s, d),
      onHistory: () => undefined,
      onMessage: (m) => this.onRoomMessage(m),
      onTyping: () => undefined,
      onError: (e) => console.error(`[room] ${e}`),
    });
  }

  /** Connect to the room; the session starts once the socket is live. */
  async run(): Promise<void> {
    await this.client.start();
  }

  private onStatus(status: YappchattStatus, detail?: string): void {
    console.log(`[room] ${status}${detail ? " — " + detail : ""}`);
    if (status === "connected" && !this.announced) {
      this.announced = true;
      void this.post(`Claude on project ${this.opts.projectName} is connected`);
      this.startSession();
    }
  }

  private startSession(): void {
    this.session = new BridgeSession(
      {
        cwd: this.opts.cwd,
        model: this.opts.model,
        seedContext: this.opts.seedContext,
        resumeSessionId: this.opts.resumeSessionId,
      },
      {
        onSessionInit: (id) => console.log(`[session] init ${id}`),
        // Concise: deltas ignored, the completed text is posted. Verbose: deltas streamed
        // in coalesced chunks and the completed text is NOT re-posted (already streamed).
        onText: (delta) => {
          if (this.verbose) this.bufferVerbose(delta);
        },
        onToolUse: (_name, summary) => {
          console.log(`[session] · ${summary}`);
          if (this.verbose) this.flushVerbose(); // keep streamed text before the tool line, in order
          void this.post(`· ${summary}`);
        },
        onAssistantDone: (text) => {
          console.log(`[session] assistant (${text.length} chars): ${text.slice(0, 100)}`);
          if (this.verbose) this.flushVerbose();
          else void this.post(text);
        },
        onResult: (subtype) => {
          console.log(`[session] result: ${subtype}`);
          if (this.verbose) this.flushVerbose();
          this.turnActive = false;
          if (subtype !== "success") void this.post(`⚠ turn ended: ${subtype}`);
        },
        onError: (message) => {
          console.error(`[session] error: ${message}`);
          // A torn-down session's process exit (SIGTERM=143 / SIGINT=130) is expected and
          // races the shutdown flag — never surface a process-exit error to the room.
          if (this.tornDown || /process exited with code/i.test(message)) return;
          void this.post(`⚠ ${message}`);
        },
      },
    );
    void this.session.start();
  }
  // [SCOPE 102 / T005] END

  // [SCOPE 102 / T006] BEGIN — inbound routing (room -> session), continue-and-fold
  private onRoomMessage(m: YappchattMessage): void {
    const text = m.text.trim();
    if (!text) return;
    // Claude's posts are now authored by the agent user (isagent), so drop our own
    // echoes by that flag — robust against YappChatt's prose translation, which changes
    // the text and would defeat content-matching. consumeSelfEcho stays as a fallback
    // for any legacy same-identity echo.
    if (m.isAgent) return;
    if (this.consumeSelfEcho(text)) return;
    // While a push confirmation is pending, the next message IS the decision (lenient yes/no) — never
    // relay it to the AI session, which is hard-blocked from pushing and would report "blocked".
    if (this.pendingPush && text.toUpperCase() !== "CANCEL REMOTE") {
      this.resolvePendingPush(text);
      return;
    }
    if (this.handleControl(text)) return;
    if (!this.session) {
      console.log("[bridge] message before session ready — ignored:", text.slice(0, 60));
      return;
    }
    console.log(`[bridge] operator → session: ${text.slice(0, 80)}`);
    this.turnActive = true;
    this.session.send(text);
  }

  private consumeSelfEcho(text: string): boolean {
    const now = Date.now();
    this.pruneSelfPosts(now);
    const idx = this.selfPosts.findIndex((p) => p.text === text);
    if (idx >= 0) {
      this.selfPosts.splice(idx, 1);
      return true;
    }
    return false;
  }

  private pruneSelfPosts(now: number): void {
    while (this.selfPosts.length > 0 && now - this.selfPosts[0].at > 60_000) this.selfPosts.shift();
  }
  // [SCOPE 102 / T006] END

  // [SCOPE 102 / T007] BEGIN — control vocabulary (parsed before relaying to the session)
  private handleControl(text: string): boolean {
    switch (text.toUpperCase()) {
      case "STOP":
        void this.post("⏹ stopping the current task");
        void this.session?.interrupt();
        this.turnActive = false;
        return true;
      case "CONTINUE":
        this.turnActive = true;
        this.session?.send("Continue.");
        return true;
      case "STATUS":
        void this.post(this.statusLine());
        return true;
      case "VERBOSE":
        this.verbose = true;
        void this.post("🔊 verbose: streaming output as Claude types");
        return true;
      case "CONCISE":
        this.flushVerbose();
        this.verbose = false;
        void this.post("🔉 concise: summarised output only");
        return true;
      case "CANCEL REMOTE":
        void this.shutdown().finally(() => process.exit(0));
        return true;
      // MODIFIED-BY: [SCOPE 102 / T008] — review-gated push control words
      case "PUSH":
        void this.runPushGate();
        return true;
      // CONFIRMED / NO are handled by resolvePendingPush (leniently) while a push is pending;
      // with no pending push they fall through to the session as ordinary text.
      default:
        return false;
    }
  }

  private statusLine(): string {
    const state = !this.session ? "starting" : this.turnActive ? "working" : "idle";
    const id = this.session?.id ? this.session.id.slice(0, 8) : "—";
    const verbosity = this.verbose ? "verbose" : "concise";
    return `Status — project ${this.opts.projectName} · session ${id} · ${state} · ${verbosity}`;
  }
  // [SCOPE 102 / T007] END

  // [SCOPE 102 / T008] BEGIN — review-gated push (operator-initiated: PUSH → review → CONFIRMED)
  private async runPushGate(): Promise<void> {
    console.log("[push] PUSH received");
    if (this.pendingPush) {
      void this.post("A push is already pending — reply CONFIRMED or NO.");
      return;
    }
    let target;
    try {
      target = await gitTarget(this.opts.cwd);
    } catch (err) {
      console.error(`[push] gitTarget failed: ${(err as Error).message}`);
      void this.post(`Could not read the git branch/remote — ${(err as Error).message}`);
      return;
    }
    console.log(`[push] reviewing ${target.branch} → ${target.remote}`);
    void this.post(`Running pre-push review of ${target.branch} — this can take a minute…`);
    let clean: boolean;
    let summary: string;
    try {
      const verdict = await runReview(this.opts.cwd, this.opts.model);
      clean = verdict.clean;
      summary = verdict.summary;
    } catch (err) {
      console.error(`[push] review threw: ${(err as Error).message}`);
      void this.post(`Review failed — not pushing. ${(err as Error).message}`);
      return;
    }
    console.log(`[push] review clean=${clean} (summary ${summary.length} chars)`);
    if (!clean) {
      void this.post(`Pre-push review (wxUIUXCodeReview) found issues — push NOT offered:\n\n${summary}`);
      return;
    }
    this.pendingPush = { remote: target.remote, branch: target.branch };
    // Show the review first (so it can be viewed), then ask a clear yes/no question.
    void this.post(`Pre-push review (wxUIUXCodeReview) — CLEAN:\n\n${summary}`);
    void this.post(
      `Do you want me to push ${target.branch} → ${target.remote}? ` +
        `Reply CONFIRMED to push, or NO to cancel.`,
    );
    console.log(`[push] awaiting confirmation for ${target.branch} → ${target.remote}`);
  }

  private resolvePendingPush(text: string): void {
    const p = this.pendingPush;
    if (!p) return;
    const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
    const yes = /^(confirmed|confirm|yes|y|yep|yeah|yup|ok|okay|go|go ahead|do it|push|push it|ship it|send it)$/.test(t);
    const no = /^(no|n|nope|nah|cancel|abort|stop|don'?t|do not)$/.test(t);
    console.log(`[push] decision reply "${text.slice(0, 40)}" → ${yes ? "yes" : no ? "no" : "unclear"}`);
    if (yes) {
      this.pendingPush = undefined;
      void this.executePush(p.remote, p.branch);
    } else if (no) {
      this.pendingPush = undefined;
      void this.post("push cancelled");
    } else {
      void this.post(`Please reply CONFIRMED (or yes) to push ${p.branch} → ${p.remote}, or NO to cancel.`);
    }
  }

  private async executePush(remote: string, branch: string): Promise<void> {
    console.log(`[push] executing: git push ${remote} ${branch}`);
    void this.post(`Pushing ${branch} → ${remote}…`);
    const res = await gitPush(this.opts.cwd, remote, branch);
    console.log(`[push] git push ok=${res.ok}`);
    void this.post(res.ok ? `✅ Pushed ${branch} → ${remote}\n${res.output}` : `❌ Push failed:\n${res.output}`);
  }
  // [SCOPE 102 / T008] END

  // [SCOPE 102 / T005] BEGIN — teardown notice (FR-009 seed; full CANCEL REMOTE in T009)
  async shutdown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;
    try {
      await this.post(`Claude on project ${this.opts.projectName} is disconnected`);
    } catch {
      /* best-effort */
    }
    this.session?.stop();
    this.client.dispose();
  }

  private async post(text: string): Promise<void> {
    // Posts are authored as the Claude agent server-side (isagent) and render on the left
    // as "🤖 Claude" — identical for every project. The content is therefore tagged with
    // the project name so a room shows which codebase is talking (config.postPrefix).
    //
    // Record the string the client will ACTUALLY post, not the raw text: the self-echo
    // fallback matches on exact equality, so recording the untagged form would break it
    // silently. The primary inbound drop is still the isAgent flag.
    const now = Date.now();
    this.selfPosts.push({ text: this.client.formatOutgoing(text), at: now });
    this.pruneSelfPosts(now);
    const ok = await this.client.send(text);
    if (!ok) console.error(`[bridge] failed to post: ${text.slice(0, 80)}`);
  }

  // [SCOPE 102 / T005] Verbose token streaming: coalesce deltas into readable chunks so
  // the room gets near-real-time output without a message per token.
  private bufferVerbose(delta: string): void {
    this.verboseBuffer += delta;
    if (this.verboseBuffer.length >= 400) {
      this.flushVerbose();
      return;
    }
    if (!this.verboseTimer) {
      this.verboseTimer = setTimeout(() => this.flushVerbose(), 1500);
    }
  }

  private flushVerbose(): void {
    if (this.verboseTimer) {
      clearTimeout(this.verboseTimer);
      this.verboseTimer = undefined;
    }
    const chunk = this.verboseBuffer.trim();
    this.verboseBuffer = "";
    if (chunk) void this.post(chunk);
  }
  // [SCOPE 102 / T005] END
}
