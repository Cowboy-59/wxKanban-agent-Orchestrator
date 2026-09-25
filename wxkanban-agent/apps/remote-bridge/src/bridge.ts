import {
  YappchattClient,
  resolveYappchattConfig,
  type YappchattMessage,
  type YappchattStatus,
} from "../../../core/yappchatt";
import { BridgeSession } from "./session";
import { gitPush, gitTarget, runReview } from "./push-gate";
import { createGateHook, type OverrideRequest } from "./override-gate"; // [SCOPE 134 / T018, T035]
import { recordOverride } from "./agent-mode"; // [SCOPE 134 / T019]

// [SCOPE 134 / T018] One yes/no parser, used by BOTH the operator-initiated push
// confirmation and the agent-initiated gate. It was inline in resolvePendingPush; two
// copies would have drifted, and an approval parser that says yes where its twin says
// unclear is the kind of difference nobody notices until it matters.
// Returns undefined for "unclear" — which is neither, and must never be read as yes.
function parseYesNo(text: string): boolean | undefined {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(confirmed|confirm|yes|y|yep|yeah|yup|ok|okay|go|go ahead|do it|push|push it|ship it|send it)$/.test(t)) {
    return true;
  }
  if (/^(no|n|nope|nah|cancel|abort|stop|don'?t|do not)$/.test(t)) return false;
  return undefined;
}

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
  // [SCOPE 134 / T019, T030] Present in project-agent mode: the audit identity and bound
  // MCP token every gate decision is filed through.
  agent?: { name: string; projectId: string; mcpUrl: string; mcpToken: string };
  // [SCOPE 134 / T031] The supervising agent (KAIN). Agent-authored messages tagged with
  // its name are input to the session and may answer a gate (FR-032, FR-033). Absent =
  // operator-driven bridge: every agent-authored message is dropped, as before.
  supervisor?: string;
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
  // [SCOPE 134 / T018] The mirror image of pendingPush. That one is OPERATOR-initiated —
  // the room says PUSH and the bridge asks. This one is AGENT-initiated: the session tries
  // something gated, canUseTool suspends it, and the resolver below is what un-suspends it.
  // It holds a RESOLVER rather than state, because something is already waiting on it.
  private pendingApproval?: { resolve: (ok: boolean) => void; request: OverrideRequest };
  // [SCOPE 134 / T019] Who answered the last gate prompt, for the audit record. Set by
  // resolvePendingApproval immediately before it resolves, read by onDecision after.
  private lastDecider?: string;
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
        // [SCOPE 134 / T010, T018] Supplying a gate is what lifts the hard `git push`
        // block: the action becomes reachable, and reaching it means suspending here
        // until the operator answers. BridgeSession refuses to accept one without the
        // other, so this cannot silently become "unblocked and ungated".
        // `onDecision` is deliberately not wired to terminal output: every decision
        // already surfaces to the operator in the room and belongs durably in
        // project.record_override, which is where it goes once the bridge holds an
        // agent token. A third copy in stdout would be the least reliable of the three.
        overrideGate: createGateHook({
          requestApproval: (req) => this.requestApproval(req),
          // [SCOPE 134 / T019] The record is a by-product of deciding (FR-006): every
          // decision, granted or not, is filed. Not awaited — a slow or failed record
          // must never hold a granted action hostage or flip a refusal.
          onDecision: (req, granted) => this.recordDecision(req, granted),
        }),
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
    let text = m.text.trim();
    if (!text) return;
    // Who said it, for the audit record if this turns out to answer a gate.
    let from = m.from;
    // Claude's posts are now authored by the agent user (isagent), so drop our own
    // echoes by that flag — robust against YappChatt's prose translation, which changes
    // the text and would defeat content-matching. consumeSelfEcho stays as a fallback
    // for any legacy same-identity echo.
    if (m.isAgent) {
      // [SCOPE 134 / T031] Every agent in a room is the same YappChatt user, so the tag
      // is the only discriminator (FR-032). Only the supervisor's tag is input; our own
      // posts carry the project's tag and fall through to the drop.
      const sup = this.opts.supervisor;
      const tag = sup ? `[${sup}]` : "";
      if (!sup || !text.startsWith(tag)) return;
      text = text.slice(tag.length).trim();
      if (!text) return;
      from = sup;
    }
    if (this.consumeSelfEcho(text)) return;
    // While a push confirmation is pending, the next message IS the decision (lenient yes/no) — never
    // relay it to the AI session, which is hard-blocked from pushing and would report "blocked".
    if (this.pendingPush && text.toUpperCase() !== "CANCEL REMOTE") {
      this.resolvePendingPush(text);
      return;
    }
    // [SCOPE 134 / T018] Same rule for an agent-initiated gate: while one is pending the
    // next message IS the decision. Relaying it to the session instead would leave the
    // gate waiting forever on an answer that went somewhere else.
    if (this.pendingApproval && text.toUpperCase() !== "CANCEL REMOTE") {
      this.resolvePendingApproval(text, from);
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

  // [SCOPE 134 / T018] BEGIN — agent-initiated approval (the canUseTool side)
  /**
   * Surface a gated action to the operator and resolve with their answer.
   *
   * Handed to the session as the gate's `requestApproval`. Everything that is not an
   * explicit yes resolves false: a denial, a disconnect, a teardown, a second request
   * arriving while one is pending. Silence never becomes consent — the promise simply
   * stays unresolved until something refuses it, and the action does not run meanwhile.
   */
  private requestApproval(request: OverrideRequest): Promise<boolean> {
    // One at a time. A second gated action while one is pending is refused rather than
    // queued, because the operator's next reply would be ambiguous between them.
    if (this.pendingApproval) {
      void this.post("Another action is already awaiting approval — refusing this one.");
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      this.pendingApproval = { resolve, request };
      void (async () => {
        // A push the AGENT asks for runs the same review the operator-initiated path
        // runs. Skipping it would make the agent route WEAKER than the human one, which
        // is the wrong direction for the route with less judgement behind it.
        let reviewNote = "";
        if (request.action === "gitpush") {
          void this.post(`${this.agentLabel()} wants to push. Running the pre-push review first…`);
          try {
            const verdict = await runReview(this.opts.cwd, this.opts.model);
            if (!verdict.clean) {
              this.pendingApproval = undefined;
              void this.post(
                `Review is NOT clean — refusing the push without asking.\n${verdict.summary ?? ""}`.trim(),
              );
              resolve(false);
              return;
            }
            reviewNote = "Review clean. ";
          } catch (err) {
            // A review that cannot run is not a review that passed.
            this.pendingApproval = undefined;
            void this.post(`Could not run the pre-push review — refusing. ${(err as Error).message}`);
            resolve(false);
            return;
          }
        }

        void this.post(
          [
            `${this.agentLabel()} is asking to run a gated action.`,
            ``,
            `  ${request.detail}`,
            ``,
            `${reviewNote}Reply CONFIRMED to allow, or NO to refuse` +
            (this.opts.supervisor ? ` (you or ${this.opts.supervisor}).` : `.`),
          ].join("\n"),
        );
      })();
    });
  }

  private resolvePendingApproval(text: string, from?: string): void {
    const p = this.pendingApproval;
    if (!p) return;
    const decision = parseYesNo(text);
    if (decision === undefined) {
      void this.post(`Please reply CONFIRMED to allow, or NO to refuse.`);
      return;
    }
    this.pendingApproval = undefined;
    this.lastDecider = from;
    void this.post(decision ? "Allowed." : "Refused.");
    p.resolve(decision);
  }

  /** Refuse anything still waiting. Called on teardown and on losing the room. */
  private abandonPendingApproval(reason: string): void {
    const p = this.pendingApproval;
    if (!p) return;
    this.pendingApproval = undefined;
    void reason; // the refusal reaches the operator via the room and the audit record
    this.lastDecider = undefined;
    p.resolve(false);
  }

  /** How the agent refers to itself in the room. The post prefix tags it too (FR-018). */
  private agentLabel(): string {
    return this.opts.agent ? "The project agent" : "The agent";
  }

  // [SCOPE 134 / T019] File the decision. Only a grant names a grantor — a refusal
  // (including abandon-on-teardown) has no approving human, and the MCP tool rejects a
  // grant without one, which is the constitution's "never self-approved" made concrete.
  private recordDecision(request: OverrideRequest, granted: boolean): void {
    const agent = this.opts.agent;
    const decider = this.lastDecider;
    this.lastDecider = undefined;
    if (!agent) return; // operator-driven bridge: no agent token to file with
    void recordOverride(agent.mcpUrl, agent.mcpToken, {
      projectId: agent.projectId,
      agentName: agent.name,
      sessionId: this.session?.id,
      action: request.action,
      granted,
      grantedBy: granted ? decider ?? "operator" : undefined,
      requestText: request.detail,
    }).then((r) => {
      if (!r.ok) void this.post(`⚠ Could not file the audit record for that decision — ${r.detail.slice(0, 160)}`);
    });
  }
  // [SCOPE 134 / T018] END

  private resolvePendingPush(text: string): void {
    const p = this.pendingPush;
    if (!p) return;
    const decision = parseYesNo(text);
    const yes = decision === true;
    const no = decision === false;
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
    // [SCOPE 134 / T018] Refuse anything still waiting, FIRST. A gated action holding an
    // unresolved promise while the room goes away must end as a refusal, not as a session
    // that quietly proceeds once nobody is watching.
    this.abandonPendingApproval("bridge shutting down");
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
