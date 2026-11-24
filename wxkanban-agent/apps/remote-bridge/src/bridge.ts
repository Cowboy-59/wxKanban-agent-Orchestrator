import { readdirSync, readFileSync } from "fs"; // [SCOPE 154 / T006]
import { join } from "path"; // [SCOPE 154 / T006]
import {
  YappchattClient,
  resolveYappchattConfig,
  type YappchattConnection, // [SCOPE 150 / T003]
  type YappchattMessage,
  type YappchattStatus,
  ROOM_LINK_ALERT_FAILURES, // [SCOPE 144 / T024]
  type RoomLinkInfo, // [SCOPE 144 / T024]
} from "../../../core/yappchatt";
import {
  createRoomLinkLogger,
  formatOutageNotice,
  formatRoomLinkAlert,
  logRoomLinkAlert,
  logRoomLinkOutage,
  maskReason, // [SCOPE 144 / T025]
  roomLinkOwner,
} from "./room-link"; // [SCOPE 144 / T024]
import { recordRoomLink } from "./agent-status"; // [SCOPE 144 / T027]
import type { RoomLinkFields } from "./connection-record"; // [SCOPE 144 / T025]
import type { Logger } from "pino"; // [SCOPE 144 / T024]
import { resolveApiToken } from "../../../core/http/mcp-client"; // [SCOPE 144 / T002]
import { BridgeSession } from "./session";
import { gitPush, gitTarget, runReview } from "./push-gate";
import { createGateHook, type OverrideRequest } from "./override-gate"; // [SCOPE 134 / T018, T035]
import { readyLine, recordOverride, refreshMcpToken, type ProjectAgentConfig } from "./agent-mode"; // [SCOPE 134 / T019] [SCOPE 145 / T006] [SCOPE 148 / T012]
import { TriageSchedule } from "./triage-schedule"; // [SCOPE 148 / T012]
import { localDate } from "./triage-run"; // [SCOPE 154 / T008]
import { AutopilotSchedule } from "./autopilot-schedule"; // [SCOPE 154 / T003]
import { fetchScopeStage } from "./autopilot-startup"; // [SCOPE 154 / T004]
import { buildHeartbeat, buildFullSummary } from "./autopilot-heartbeat"; // [SCOPE 154 / T008]
import { isHeartbeatMissed, stepOutage, formatHeartbeatMissed, formatHeartbeatBack } from "./autopilot-outage"; // [SCOPE 154 / T009]
import { redactSecrets } from "./redact"; // [SCOPE 155 / T004]
import {
  runPipeline,
  nodeDependentsResolver,
  nodeLedgerResolver,
  nodeLedgerWriter,
  type PipelineUnit,
  type GateResolver,
} from "./autopilot-pipeline"; // [SCOPE 154 / T005, T013]
import { createAutopilotUnitRunner } from "./autopilot-unit-runner"; // [SCOPE 154 / T005b]
import { describeUnitMessage } from "./autopilot-debug-feed"; // [SCOPE 154 / T015]
import {
  AUTOPILOT_QUESTION_LAST_CALL_MS,
  AUTOPILOT_QUESTION_PARK_MS,
  formatQuestionAsked,
  formatQuestionAutoParked,
  formatQuestionBroughtBack,
  formatQuestionLastCall,
  formatQuestionReminder,
  isQuestionPassThrough,
  toAutopilotQuestion,
  type AutopilotQuestion,
  type PendingAutopilotQuestion,
} from "./autopilot-question"; // [SCOPE 154 / T015]
import {
  loadAutopilotState,
  saveAutopilotState,
  recordUnitOutcome,
  runSkipCascade,
  parseKeepReply,
  applyKeepDecision,
  recordStartupList, // [SCOPE 154 / T003]
  recordCurrentStep, // [SCOPE 154 / T003]
  clearCurrentStep, // [SCOPE 154 / T003]
  type UnitRunRecord,
} from "./autopilot-skip"; // [SCOPE 154 / T005, T004]
import { McpTokenHolder } from "./mcp-token"; // [SCOPE 148 / T012]
import { startOutboxDrain } from "./outbox"; // SPEC-142 / T010
import { decisionReplyFor, handleDecisionReply, nodeRunner } from "./decision-reply"; // [SCOPE 142 / T025]
import { defaultApproverLookup, handleHumanDecision, httpApproverLookup, type ApproverLookup, type HumanDecisionOutcome } from "./decision-reply"; // [SCOPE 144 / T010]
import { HandoffWatcher } from "./handoff-watch"; // [SCOPE 149 / T006]
import { HandoffQueue } from "./handoff-queue"; // [SCOPE 149 / T006]
import { createHandoffLogger } from "./handoff-log"; // [SCOPE 149 / T006]
import { HandoffTurnGuard, handoffPrompt } from "./handoff-turn"; // [SCOPE 149 / T007]
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk"; // [SCOPE 149 / T007]
import { fromLocalRoom, labelFromAgent, listTakesMessage, oldInboundPathOn, type InboundMessage } from "./inbound"; // [SCOPE 159 / T004]
import { LocalRoom } from "./local-room"; // [SCOPE 159 / T004]
import { RunLog } from "./run-log"; // [SCOPE 159 / T016]
import { buildPanel, writePanelSnapshot, type GateInput, type WorkerInput } from "./room-view"; // [SCOPE 159 / T018]
import { NOT_RECORDED_NOTE, notRecordedRelay } from "./decision-reply"; // [SCOPE 159 / T005]
import { GateRaisers, WorkerRegistry, type WorkerIdentity } from "./worker-identity"; // [SCOPE 159 / T006]
import type { ContractResult, RoomMessage, SenderStamp } from "../../../common-room/src/index"; // [SCOPE 159 / T004]

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

// [SCOPE 154 / T008] How often the heartbeat posts, and the local hour the daily full summary is
// due — same tick-reads-the-clock shape as TRIAGE_HOUR/TICK_MS in triage-schedule.ts, not a
// setTimeout armed 15 minutes or hours ahead (a suspended laptop would miss that fire time).
const AUTOPILOT_HEARTBEAT_MS = 15 * 60_000;
const AUTOPILOT_SUMMARY_HOUR = 18;

// [SCOPE 102 / T005] BEGIN — RemoteBridge: composes the room transport with the session
// MODIFIED-BY: [SCOPE 145 / T006] — prints the fixed ready line once the "connected" post lands
// MODIFIED-BY: [SCOPE 148 / T012] — feedback triage schedule, TRIAGE command, one shared MCP token holder (FR-016)
// MODIFIED-BY: [SCOPE 149 / T006] — arms the hand-off watcher and one-slot queue in project-agent mode; posts [HANDOFF] when free (FR-006, FR-008)
// MODIFIED-BY: [SCOPE 149 / T007] — a posted [HANDOFF] starts a context-only turn under the handoff guard; the guard lifts when the turn ends (FR-007)
// MODIFIED-BY: [SCOPE 154 / T003] — arms the Autopilot startup schedule; the owner's "go" to a posted startup list is captured here (FR-002)
// MODIFIED-BY: [SCOPE 151 / T004] — connectionState() for the connection record's heartbeat (FR-060)
// MODIFIED-BY: [SCOPE 144 / T010] — an injectable Room Approver lookup (approverLookup) for person-posted DQ/KR replies (FR-008)
// MODIFIED-BY: [SCOPE 144 / T024] — one alert on the 5th failed reconnect in a row, one notice after an outage over 5 min (FR-015, FR-017)
// MODIFIED-BY: [SCOPE 144 / T027] — onRoomLink also writes the Room Link into .wxai/project-agent-status.json for the Cockpit (AB-1)
// MODIFIED-BY: [SCOPE 144 / T025] — roomLinkState() for the connection record's heartbeat (FR-016)
// MODIFIED-BY: [SCOPE 144 / T026] — on a reconnect, each gate still waiting is asked again once (FR-020)
// MODIFIED-BY: [SCOPE 144 / T030] — an outage holds an Autopilot gate: its 10/15 min timers stop while the link is down and restart from the re-ask (FR-020)
// MODIFIED-BY: [SCOPE 144 / T031] — pendingApproval carries `reviewNoted`: the one room note per approval for a reply sent before its question (FR-021)
// Outbound relay (session -> room) is the handler set passed to BridgeSession; inbound
// routing (room -> session) is onRoomMessage. Connect announce on first 'connected'
// (FR-002), disconnect notice on shutdown (FR-009). Concise by default: assistant text
// and one line per tool call are posted; raw token deltas are held for a later VERBOSE.

export interface RemoteBridgeOptions {
  projectName: string;
  cwd: string;
  model?: string;
  // [SCOPE 150 / T003, T004] The room connection the project agent fetched, handed over in
  // memory (FR-011). The seed and resume hooks are gone (FR-012).
  connection?: YappchattConnection;
  // [SCOPE 134 / T019, T030] Present in project-agent mode: the audit identity and bound
  // MCP token every gate decision is filed through. [SCOPE 148 / T012] mcpExpiresAt seeds the
  // token holder; absent, the first use renews.
  agent?: { name: string; projectId: string; mcpUrl: string; mcpToken: string; mcpExpiresAt?: string };
  // [SCOPE 134 / T031] The supervising agent (KAIN). Agent-authored messages tagged with
  // its name are input to the session and may answer a gate (FR-032, FR-033). Absent =
  // operator-driven bridge: every agent-authored message is dropped, as before.
  supervisor?: string;
  // [SCOPE 148 / T012] Present in project-agent mode: the config a triage run re-authenticates
  // with. Absent = no feedback triage at all, and TRIAGE stays ordinary text (SCOPE-102 intact).
  projectAgentConfig?: ProjectAgentConfig;
  // [SCOPE 144 / T010] Who may record a DQ answer or KR review from a person's post (FR-008).
  // Absent: the app's approver route, asked with the project's kit token.
  approverLookup?: ApproverLookup;
  // [SCOPE 144 / T024] Where the Room Link alert and outage records go. Absent: stderr.
  roomLinkLogger?: Logger;
  /** [SCOPE 159 / T004] One-release switch: keep the old inbound path (a waiting list takes any text). FR-017. */
  oldInboundPath?: boolean;
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
  // MODIFIED-BY: [SCOPE 144 / T026] — `asked` marks that the question is in the room (a push's review may still be running), so a reconnect re-asks only a posted question
  // MODIFIED-BY: [SCOPE 144 / T031] — `reviewNoted` marks that the room was told once that a reply before the question settles nothing (FR-021)
  private pendingApproval?: { resolve: (ok: boolean) => void; request: OverrideRequest; asked?: boolean; reviewNoted?: boolean };
  // [SCOPE 154 / T013] The mirror image of pendingApproval, for a unit session's live gate
  // question (ctx.resolveGate round trip): the next room message is the owner's free-text
  // answer, or PARK. Holds a resolver because something is already waiting on it.
  // MODIFIED-BY: [SCOPE 154 / T015] — carries askedAt + broughtBack (PendingAutopilotQuestion) for the timers and STATUS
  private pendingAutopilotGate?: PendingAutopilotQuestion;
  // [SCOPE 154 / T015] FR-015: the waiting question's last-call and auto-park timers; questions that
  // parked unanswered (kept for this bridge's life, oldest first, for STATUS to bring back); and the
  // active run's own unit list (runPipeline's for-of picks up a pushed unit), current unit and
  // outcomes, so an answer to a parked question can queue its unit once more.
  private autopilotQuestionTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly parkedAutopilotQuestions: AutopilotQuestion[] = [];
  private autopilotRunUnits?: PipelineUnit[];
  private autopilotRunCurrent?: string;
  private readonly autopilotRunOutcomes = new Map<string, string>();
  private readonly autopilotRequeued = new Set<string>();
  private readonly autopilotRequeueWhenParked = new Set<string>();
  // [SCOPE 154 / T004] A skip cascade's "keep <nums>" / "keep none" question is pending — the
  // next room message IS the owner's answer (same shape as pendingAutopilotGate above: holds the
  // scope so resolvePendingSkipCascade can persist the decision against the right record).
  private pendingSkipCascade?: { scopeNum: string; title: string };
  // [SCOPE 134 / T019] Who answered the last gate prompt, for the audit record. Set by
  // resolvePendingApproval immediately before it resolves, read by onDecision after.
  private lastDecider?: string;
  private verboseBuffer = "";
  private verboseTimer?: ReturnType<typeof setTimeout>;
  private stopOutboxDrain?: () => void;
  // [SCOPE 148 / T012] The feedback-triage schedule. Only ever constructed in project-agent
  // mode, and it arms itself only once the server says this project is the sink (FR-001).
  private triage?: TriageSchedule;
  // [SCOPE 154 / T003] The Autopilot startup schedule. Only ever constructed in project-agent
  // mode, and it arms itself only once the server says Autopilot is on for this project (FR-001).
  private autopilot?: AutopilotSchedule;
  // [SCOPE 154 / T005] Set while a pipeline run is in flight — guards against a second "go"
  // starting a concurrent run. Not aborted by shutdown(): per the triage schedule's own precedent
  // just above, a run already in flight is left to finish or fail on its own rather than killed
  // mid-unit, which is what would leave a partial, unrecorded result.
  private autopilotRunAbort?: AbortController;
  // [SCOPE 154 / T008] BEGIN — the 15-minute heartbeat (FR-007). `paused` is always false here:
  // nothing anywhere in the codebase tracks a paused run yet (confirmed in T009's design note),
  // so the heartbeat never reports "paused" until a pause mechanism exists. Lives only for the
  // duration of a run — started in runAutopilotPipeline, stopped in its `finally`.
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatPostedScopes: string[] = [];
  private lastFullSummaryDate?: string;
  // [SCOPE 154 / T008] END

  // [SCOPE 154 / T009] BEGIN — pause state and the missed-heartbeat outage check (FR-008).
  // Pause is owner-issued room control (PAUSE/RESUME, below), tracked only here — there is
  // nowhere else to put it: not the DB (autopilotrunactive is a run-active flag, not a pause
  // flag), not AutopilotRunState (that's the unit ledger, not run control). Lives only for the
  // duration of a run, same as the heartbeat fields it feeds.
  private autopilotPaused = false;
  private lastHeartbeatPostOkAt?: Date;
  private outageAlerting = false;
  // [SCOPE 154 / T009] END
  // [SCOPE 148 / T012] FR-016: the one bound MCP token holder. The room gate's records and the
  // triage runs both draw from it, so a renewal for one never revokes the other's copy. Only in
  // project-agent mode with a config to renew through; otherwise the gate uses agent.mcpToken.
  private readonly tokens?: McpTokenHolder;
  // [SCOPE 149 / T006] Project-agent mode only: the hand-off folder watcher and its one-slot queue.
  private handoffWatcher?: HandoffWatcher;
  private handoffQueue?: HandoffQueue;
  // [SCOPE 149 / T007] Project-agent mode only: the context-only guard for a [HANDOFF] turn, a
  // handoff waiting for the current turn to end, and operator messages held while one runs.
  private handoffGuard?: HandoffTurnGuard;
  private deferredHandoff?: string;
  private readonly heldDuringHandoff: string[] = [];
  private handoffLogger?: ReturnType<typeof createHandoffLogger>;
  // [SCOPE 144 / T010] The Room Approver check for a person's DQ answer or KR review (FR-008).
  private readonly approverLookup: ApproverLookup;
  // [SCOPE 159 / T004] The local worker room (lazy) and the one-release old-inbound switch (FR-017).
  private localRoomInst?: LocalRoom;
  private readonly oldInbound: boolean;
  // [SCOPE 144 / T024] The last Room Link status from the client, and whether this outage has
  // already raised its one alert (FR-017). A reconnect clears the flag.
  private roomLink?: RoomLinkInfo;
  private roomLinkAlerted = false;
  private roomLinkLog?: Logger;
  // [SCOPE 144 / T030] The link is down (reconnecting or error): an Autopilot gate's last-call and
  // auto-park timers do not run, so a gate is never parked while no one can see or answer it.
  private roomLinkDown = false;

  constructor(private readonly opts: RemoteBridgeOptions) {
    const { config, user } = resolveYappchattConfig(opts.connection); // [SCOPE 150 / T003]
    // [SCOPE 144 / T002] The read login sends the project's kit token (FR-009): the server
    // opens a session only for an email of the token's company. Absent, it goes without.
    const kitApiToken = resolveApiToken({ projectRoot: opts.cwd }) ?? undefined;
    this.client = new YappchattClient({ ...config, kitApiToken }, user, {
      onStatus: (s, d, l) => this.onStatus(s, d, l), // [SCOPE 144 / T024]
      onHistory: () => undefined,
      onMessage: (m) => this.onRoomMessage(m),
      onTyping: () => undefined,
      onError: (e) => console.error(`[room] ${e}`),
    });
    this.oldInbound = oldInboundPathOn(opts.oldInboundPath); // [SCOPE 159 / T004]
    const agent = opts.agent;
    const paCfg = opts.projectAgentConfig;
    // [SCOPE 144 / T010] Project-agent mode asks the app it is bound to; otherwise the kit's own.
    this.approverLookup =
      opts.approverLookup ??
      (paCfg?.appBaseUrl ? httpApproverLookup(paCfg.appBaseUrl, paCfg.projectToken ?? null) : defaultApproverLookup(opts.cwd));
    if (agent && paCfg) {
      this.tokens = new McpTokenHolder({
        initial: { token: agent.mcpToken, expiresAt: agent.mcpExpiresAt ?? "" },
        renew: () => refreshMcpToken(paCfg),
        // Once per failure streak, and never the token itself.
        onRenewFailed: (reason) =>
          void this.post(
            `⚠ The MCP token could not be renewed (${reason.slice(0, 160)}). Gate records and feedback triage may fail until it can.`,
          ),
      });
    }
  }

  /** Connect to the room; the session starts once the socket is live. */
  async run(): Promise<void> {
    await this.client.start();
  }

  private onStatus(status: YappchattStatus, detail?: string, link?: RoomLinkInfo): void {
    console.log(`[room] ${status}${detail ? " — " + detail : ""}`);
    if (link) this.onRoomLink(status, link); // [SCOPE 144 / T024]
    // [SCOPE 144 / T030] Until SPEC-160 an outage holds a gate: stop the Autopilot question timers.
    // A socket "error" on a link still up is followed by its close, which reconnects; it is not down.
    if (status === "reconnecting" || (status === "error" && link?.roomLink !== "connected")) {
      this.roomLinkDown = true;
      this.clearAutopilotQuestionTimers();
    }
    if (status === "connected") this.roomLinkDown = false; // [SCOPE 144 / T030]
    // [SCOPE 144 / T026] Connected again after the first time: the link dropped, so every gate
    // still waiting is asked once more; only a reply after that counts (FR-020).
    if (status === "connected" && this.announced) this.reaskWaitingGates();
    if (status === "connected" && !this.announced) {
      this.announced = true;
      // SPEC-145 FR-005: the Cockpit's ready signal, printed only once the post has landed.
      void this.post(`Claude on project ${this.opts.projectName} is connected`).then((ok) => {
        if (ok) process.stdout.write(`${readyLine(this.opts.projectName)}\n`);
      });
      // SPEC-142 / T010: relay blockers the Ask Gate queued in .wxai/room-outbox.jsonl.
      this.stopOutboxDrain = startOutboxDrain(this.opts.cwd, (t) => this.post(t));
      this.startSession();
      // [SCOPE 148 / T012] Armed after the room is live, so the sink gate's verdict and any
      // catch-up run can actually be reported. Its own session is separate from the room's.
      const paCfg = this.opts.projectAgentConfig;
      // Both, not either: the config authenticates the run and the agent carries the projectId
      // the fingerprint's feedback calls are scoped to. They are set together or not at all.
      if (paCfg && this.opts.agent) {
        this.triage = new TriageSchedule({
          repoRoot: this.opts.cwd,
          config: paCfg,
          projectId: this.opts.agent.projectId, // [SCOPE 148 / T013]
          tokens: this.tokens, // FR-016: the same token the gate files with
          // post() reports delivery with a boolean; the schedule only needs it to have been
          // attempted, and a failed post is already logged where it happens.
          post: async (t) => {
            await this.post(t);
          },
        });
        void this.triage.start().catch((err) => {
          console.error(`[triage] schedule failed to start: ${(err as Error).message}`);
        });
        // [SCOPE 154 / T003] Same wiring as triage above: fetch the Autopilot gate, and if on,
        // post the server devplan's startup list and wait for the owner's "go" (FR-002).
        this.autopilot = new AutopilotSchedule({
          config: paCfg,
          projectId: this.opts.agent.projectId,
          tokens: this.tokens,
          post: async (t) => {
            await this.post(t);
          },
        });
        // [SCOPE 154 / T003] Once the devplan list is posted and the schedule is waiting on the
        // owner's "go", persist it to the run state so the Cockpit (T014) can show it before the
        // run itself starts. A `start()` that found nothing to do (no devplan, or an empty list)
        // leaves `pendingScopes` undefined, and nothing is written.
        void this.autopilot
          .start()
          .then(() => {
            const scopes = this.autopilot?.pendingScopes;
            if (scopes && scopes.length > 0) {
              const next = recordStartupList(
                loadAutopilotState(this.opts.cwd),
                scopes.map((s) => ({ num: s.num, title: s.title })),
              );
              saveAutopilotState(this.opts.cwd, next);
            }
          })
          .catch((err) => {
            console.error(`[autopilot] schedule failed to start: ${(err as Error).message}`);
          });
        // [SCOPE 149 / T006] A waiting hand-off is posted once the agent is free (FR-006, FR-008).
        const handoffLogger = this.handoffLog();
        this.handoffQueue = new HandoffQueue({
          isBusy: () => this.handoffBusy(),
          // [SCOPE 149 / T007] Once the [HANDOFF] post has landed, the context-only turn starts,
          // so the reading and the question always follow the post (FR-007).
          deliver: async (f) => {
            const ok = await this.post(`[HANDOFF]\n${f.body}`);
            if (ok) this.startHandoffTurn(f.body);
            return ok;
          },
          logger: handoffLogger,
        });
        this.handoffQueue.start();
        this.handoffWatcher = new HandoffWatcher({
          repoRoot: this.opts.cwd,
          onReady: (f) => this.handoffQueue?.offer(f),
          onExpired: () => void this.post("A handoff older than 4 hours was removed without being posted."),
          logger: handoffLogger,
        });
        this.handoffWatcher.start();
      }
    }
  }

  // [SCOPE 144 / T024] BEGIN — Room Link alert and outage notice (FR-015, FR-017)
  // One alert per outage, on the 5th failed reconnect in a row: one terminal line and one Pino
  // error record (the status itself already reads error). The client keeps retrying at its cap.
  // On reconnect after an outage over 5 minutes: one room post and one terminal line. A reconnect
  // clears the alert, so the next outage can raise its own.
  private onRoomLink(status: YappchattStatus, link: RoomLinkInfo): void {
    this.roomLink = link;
    // [SCOPE 144 / T027] AB-1: the Cockpit reads this local file; never throws, masks the reason.
    recordRoomLink(this.opts.cwd, { roomLink: link.roomLink, since: link.since, failures: link.failures, reason: link.reason });
    if (status === "connected") {
      const { outageStartedAt: start, outageEndedAt: end } = link;
      this.roomLinkAlerted = false;
      if (!start || !end) return;
      const notice = formatOutageNotice(start, end);
      logRoomLinkOutage(this.roomLinkLogger(), start, end, !!notice);
      if (!notice) return;
      process.stdout.write(`[room-link] ${notice}\n`);
      void this.post(notice);
      return;
    }
    if (link.failures >= ROOM_LINK_ALERT_FAILURES && !this.roomLinkAlerted) {
      this.roomLinkAlerted = true;
      process.stdout.write(`${formatRoomLinkAlert(link)}\n`);
      logRoomLinkAlert(this.roomLinkLogger(), link, roomLinkOwner());
    }
  }

  private roomLinkLogger(): Logger {
    if (!this.roomLinkLog) this.roomLinkLog = this.opts.roomLinkLogger ?? createRoomLinkLogger();
    return this.roomLinkLog;
  }
  // [SCOPE 144 / T024] END

  // [SCOPE 144 / T026] BEGIN — replayed messages are discussion only; waiting gates are re-asked (FR-020)
  // MODIFIED-BY: [SCOPE 144 / T030] — the re-asked Autopilot gate's timers restart from the re-ask
  // A message YappChatt replays after a drop was posted while the agent could not see the room, so
  // it never settles anything the bridge waits on: not a gated action, a push, an Autopilot gate or
  // go, a skip cascade, a DQ or KR answer, nor a control word. It reaches the session as discussion,
  // labeled so. Who may answer a gate is unchanged (SPEC-159); this only decides when.
  private relayReplayed(text: string, from: string): void {
    if (!this.session) return;
    const labeled =
      `[Replayed room message from ${from}, posted while the room link was down. ` +
      `Discussion only: it answers no waiting question.]\n${text}`;
    if (this.handoffGuard?.active) {
      this.heldDuringHandoff.push(labeled);
      return;
    }
    this.turnActive = true;
    this.session.send(labeled);
  }

  /** One room post per gate still waiting, each once per reconnect. */
  private reaskWaitingGates(): void {
    const lead = "The room link dropped while this was waiting, so replies sent then do not count. Asking again:\n\n";
    const asks: string[] = [];
    if (this.pendingPush) {
      const { branch, remote } = this.pendingPush;
      asks.push(`${lead}Do you want me to push ${branch} → ${remote}? Reply CONFIRMED to push, or NO to cancel.`);
    }
    if (this.pendingApproval?.asked) {
      asks.push(
        `${lead}${this.agentLabel()} is asking to run a gated action.\n\n  ${this.pendingApproval.request.detail}\n\n` +
          `Reply CONFIRMED to allow, or NO to refuse${this.opts.supervisor ? ` (a Room Approver, or ${this.opts.supervisor} relaying one).` : "."}`, // [SCOPE 159 / T005]
      );
    }
    if (this.pendingAutopilotGate) {
      asks.push(`${lead}${formatQuestionReminder(this.pendingAutopilotGate)}`);
      this.armAutopilotQuestionTimers(this.pendingAutopilotGate); // [SCOPE 144 / T030] fresh from the re-ask
    }
    if (this.pendingSkipCascade) {
      asks.push(
        `${lead}SCOPE-${this.pendingSkipCascade.scopeNum} was skipped. ` +
          'Reply "keep <scope numbers>" for the dependents safe to keep, or "keep none" to skip them all too.',
      );
    }
    if (this.autopilot?.isAwaitingGo) asks.push(`${lead}Reply "go" to start Autopilot on the posted list, or "no" to cancel.`);
    for (const a of asks) void this.post(a);
  }
  // [SCOPE 144 / T026] END

  // [SCOPE 149 / T006] The agent is free only with a live session, no turn, no gate, no triage run.
  // MODIFIED-BY: [SCOPE 154 / T003] — an Autopilot startup list awaiting "go" is busy too
  // MODIFIED-BY: [SCOPE 154 / T013] — an Autopilot unit's live gate question awaiting an answer is busy too
  private handoffBusy(): boolean {
    return (
      !this.session ||
      this.turnActive ||
      !!this.pendingPush ||
      !!this.pendingApproval ||
      !!this.pendingAutopilotGate ||
      !!this.triage?.isRunning ||
      !!this.autopilot?.isAwaitingGo
    );
  }

  // [SCOPE 151 / T004] What the connection record's heartbeat reports (FR-060): a gated action
  // pending is `waiting`, a turn or a triage run is `working`, anything else is `idle`.
  // MODIFIED-BY: [SCOPE 154 / T003] — awaiting the owner's "go" on the Autopilot list is `waiting`
  // MODIFIED-BY: [SCOPE 154 / T013] — awaiting the owner's answer to a live gate question is `waiting`
  connectionState(): "idle" | "working" | "waiting" {
    if (this.pendingPush || this.pendingApproval || this.pendingAutopilotGate || this.autopilot?.isAwaitingGo) return "waiting";
    if (this.turnActive || this.triage?.isRunning) return "working";
    return "idle";
  }

  // [SCOPE 155 / T004] BEGIN — the one pending question the connection-record heartbeat reports (FR-105)
  // Same precedence as connectionState()'s own check, so the two never disagree about *why* it is
  // waiting. Masked and capped the same way the server would re-mask it (defense in depth).
  waitingQuestion(): string | null {
    let text: string | undefined;
    if (this.pendingPush) {
      text = `Push ${this.pendingPush.branch} to ${this.pendingPush.remote}?`;
    } else if (this.pendingApproval) {
      const { action, toolName, detail } = this.pendingApproval.request;
      text = `${action} via ${toolName}: ${detail}`;
    } else if (this.pendingAutopilotGate) {
      text = this.pendingAutopilotGate.question;
    } else if (this.autopilot?.isAwaitingGo) {
      const n = this.autopilot.pendingScopes?.length ?? 0;
      text = `Autopilot startup list awaiting "go" (${n} scope${n === 1 ? "" : "s"})`;
    }
    if (!text) return null;
    const masked = redactSecrets(text).text;
    return masked.length > 300 ? masked.slice(0, 300) : masked;
  }
  // [SCOPE 155 / T004] END

  // [SCOPE 144 / T025] BEGIN — the Room Link fields the connection heartbeat carries (FR-016)
  // MODIFIED-BY: [SCOPE 144 / T030] — connected sends roomLinkReason "" so the server clears the last outage's reason
  // From the client's latest status; undefined before the first one. The reason is masked again
  // and capped at 200 (defense in depth: the client already scrubbed it).
  roomLinkState(): RoomLinkFields | undefined {
    const link = this.roomLink;
    if (!link) return undefined;
    // [SCOPE 144 / T030] Connected: an explicit clear. The server's heartbeat schema takes a string
    // only (null is a 400 for the whole heartbeat), so the clear is the empty string.
    if (link.roomLink === "connected") {
      return { roomLink: link.roomLink, roomLinkSince: link.since, roomLinkFailures: link.failures, roomLinkReason: "" };
    }
    const reason = maskReason(link.reason);
    return {
      roomLink: link.roomLink,
      roomLinkSince: link.since,
      roomLinkFailures: link.failures,
      ...(reason ? { roomLinkReason: reason } : {}),
    };
  }
  // [SCOPE 144 / T025] END

  // [SCOPE 149 / T007] One handoff logger per bridge, shared by the guard, queue and watcher.
  private handoffLog(): ReturnType<typeof createHandoffLogger> {
    this.handoffLogger ??= createHandoffLogger();
    return this.handoffLogger;
  }

  // [SCOPE 149 / T007] Start the context-only turn for a [HANDOFF], or keep it (the newest only)
  // until the current turn ends. The guard is armed for exactly this turn.
  private startHandoffTurn(summary: string): void {
    if (!this.session || !this.handoffGuard) return;
    if (this.turnActive || this.handoffGuard.active) {
      this.deferredHandoff = summary;
      return;
    }
    this.handoffGuard.arm();
    this.turnActive = true;
    this.session.send(handoffPrompt(summary));
  }

  // [SCOPE 149 / T007] After any turn: lift the guard, then send what waited behind the handoff
  // turn — held operator messages first, then a deferred handoff.
  private afterTurn(): void {
    if (this.handoffGuard?.active) {
      this.handoffGuard.disarm();
      const held = this.heldDuringHandoff.splice(0);
      if (held.length > 0 && this.session) {
        this.turnActive = true;
        this.session.send(held.join("\n\n"));
        return;
      }
    }
    const next = this.deferredHandoff;
    if (next !== undefined && !this.turnActive) {
      this.deferredHandoff = undefined;
      this.startHandoffTurn(next);
    }
  }

  // [SCOPE 149 / T007] STOP during a handoff turn: lift the guard now (the interrupted turn may
  // never report), drop what waited behind it, and return the room notice saying so.
  private stopHandoffTurn(): string {
    const notice = "⏹ stopping the current task";
    if (!this.handoffGuard?.active) return notice;
    this.handoffGuard.disarm();
    const dropped = this.heldDuringHandoff.splice(0).length + (this.deferredHandoff !== undefined ? 1 : 0);
    this.deferredHandoff = undefined;
    return dropped > 0 ? `${notice} — ${dropped} held message(s) dropped, resend if still wanted` : notice;
  }

  private startSession(): void {
    // [SCOPE 149 / T007] Project-agent mode only, like the watcher: operator mode is unchanged.
    if (this.opts.projectAgentConfig && this.opts.agent) {
      this.handoffGuard = new HandoffTurnGuard({ repoRoot: this.opts.cwd, logger: this.handoffLog() });
    }
    this.session = new BridgeSession(
      {
        cwd: this.opts.cwd,
        model: this.opts.model,
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
        // [SCOPE 149 / T007] No opinion except during a handoff turn (see handoff-turn.ts).
        turnGuard: this.handoffGuard ? (this.handoffGuard.hook() as unknown as HookCallback) : undefined,
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
          this.afterTurn(); // [SCOPE 149 / T007]
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
  // MODIFIED-BY: [SCOPE 142 / T025] — queue answers and KAIN-reply reviews are recorded here, by author
  // MODIFIED-BY: [SCOPE 149 / T007] — a person-typed [HANDOFF] gets the context-only turn; messages during that turn wait for it to end (FR-007)
// MODIFIED-BY: [SCOPE 144 / T010] — a person's DQ answer or KR review is recorded only for a Room Approver, under their name (FR-008)
  // MODIFIED-BY: [SCOPE 144 / T026] — a replayed message goes to the session as discussion only and settles nothing (FR-020)
  // MODIFIED-BY: [SCOPE 144 / T030] — a failed decision outcome is logged through Pino, masked, never unhandled
  // MODIFIED-BY: [SCOPE 144 / T031] — a pending approval is settled only after its question is posted; before that the message is discussion and the room is told once (FR-021)
  // MODIFIED-BY: [SCOPE 159 / T004] — onRoomMessage only normalizes; one handler (ingest) takes every source (FR-003)
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
    // [SCOPE 159 / T004] Every source goes through the one handler below. A supervisor post is
    // marked from-agent; a person's post carries the user id the room gave.
    this.ingest({
      source: "yappchatt",
      text,
      from,
      fromAgent: m.isAgent,
      roomAgent: m.isAgent,
      authorId: m.isAgent ? undefined : m.authorId,
      replayed: m.replayed,
    });
  }

  /** The local worker room: a worker or the Manager posted a line into the journal (FR-002, FR-003). */
  receiveLocal(raw: unknown, sender: SenderStamp): ContractResult<RoomMessage> {
    const room = this.localRoom();
    const posted = room.post(raw, sender);
    if (posted.ok) this.ingest(fromLocalRoom(posted.value));
    return posted;
  }

  // [SCOPE 159 / T006] BEGIN — Worker posts are stamped by the bridge, never by the worker (FR-019, FR-029)
  // MODIFIED-BY: [SCOPE 159 / T018] — the registry also remembers who is registered, for the Agent Room panel
  readonly workers = new (class extends WorkerRegistry {
    readonly known = new Map<string, WorkerIdentity>();
    override register(identity: WorkerIdentity): void {
      super.register(identity);
      this.known.set(identity.id, { ...identity });
    }
    override unregister(workerId: string): void {
      super.unregister(workerId);
      this.known.delete(workerId);
    }
  })();
  readonly gateRaisers = new GateRaisers();

  /** A worker's post: the bridge replaces any claimed sender with the worker's true identity. */
  receiveFromWorker(workerId: string, raw: unknown): ContractResult<RoomMessage> | { ok: false; reason: "unknown_worker" | "not_an_object" } {
    const stamped = this.workers.stamp(workerId, raw);
    if (!stamped.ok) return stamped;
    this.lastBeat.set(workerId, new Date()); // [SCOPE 159 / T018] a post is a heartbeat for the lane light
    const r = this.receiveLocal(stamped.raw, stamped.sender);
    this.publishPanel();
    return r;
  }
  // [SCOPE 159 / T006] END

  // [SCOPE 159 / T018] BEGIN — Agent Room panel snapshot, rewritten on change; a write error never stops the bridge (FR-083, FR-084)
  private readonly lastBeat = new Map<string, Date>();
  publishPanel(now: Date = new Date()): void {
    try {
      const workers: WorkerInput[] = [...this.workers.known.values()].map((w) => ({
        id: w.id,
        role: "worker",
        persona: w.persona,
        model: w.model,
        taskId: w.unit,
        state: "running",
        lane: "local",
        lastBeatAt: this.lastBeat.get(w.id) ?? now,
      }));
      const gates: GateInput[] = this.gateRaisers.waiting().map((g) => ({ gateId: g.gateId, raisedBy: g.raisedBy.id, raisedAt: new Date(g.raisedAt) }));
      writePanelSnapshot(this.opts.cwd, buildPanel(this.opts.cwd, workers, gates, [], now));
    } catch {
      /* the panel is a view, not a gate */
    }
  }
  // [SCOPE 159 / T018] END

  private localRoom(): LocalRoom {
    this.localRoomInst ??= new LocalRoom({
      root: this.opts.cwd,
      projectId: this.opts.agent?.projectId ?? "",
    });
    return this.localRoomInst;
  }

  // [SCOPE 159 / T004] The one inbound handler. Gates are decided in today's order; a waiting
  // devplan list takes only go, no or skip unless the old-path switch is on (FR-003, FR-017).
  private ingest(msg: InboundMessage): void {
    const text = msg.text;
    const from = msg.from;
    // [SCOPE 159 / T016] Every inbound line is saved masked to the local run log. A write error never stops ingest (FR-073, FR-074).
    try {
      new RunLog({ root: this.opts.cwd }).writeFeed(`${from}: ${text}`);
    } catch {
      /* the log is a record, not a gate */
    }
    // [SCOPE 159 / T004] A local worker or agent line is information: it answers no gate and runs
    // no control word. The session sees it labeled from-agent (FR-003, FR-020).
    if (msg.source === "local" && msg.fromAgent) {
      if (!this.session) return;
      const labeled = labelFromAgent(msg);
      if (this.handoffGuard?.active) {
        this.heldDuringHandoff.push(labeled);
        return;
      }
      this.turnActive = true;
      this.session.send(labeled);
      return;
    }
    const m = { replayed: msg.replayed, isAgent: msg.roomAgent === true, authorId: msg.authorId };
    if (this.consumeSelfEcho(text)) return;
    // [SCOPE 144 / T026] A replayed message is discussion only: it settles no gate, decision or
    // control word, and the gate it might have answered is re-asked on reconnect (FR-020).
    if (m.replayed) {
      this.relayReplayed(text, from);
      return;
    }
    // [SCOPE 144 / T031] An agent-initiated approval counts a reply only once its question is in
    // the room (FR-021). While a push's review still runs, a message settles nothing at all: not
    // the approval, not a push, an Autopilot gate or go, a skip cascade, a DQ or KR answer, nor a
    // control word (CANCEL REMOTE excepted). The room is told once per approval, and the text
    // reaches the session as discussion, labeled so (the same shape as a replayed message).
    if (this.pendingApproval && !this.pendingApproval.asked && text.toUpperCase() !== "CANCEL REMOTE") {
      if (!this.pendingApproval.reviewNoted) {
        this.pendingApproval.reviewNoted = true;
        void this.post(
          "The push review is still running, so that message answered nothing. Answer after the question is posted.",
        );
      }
      if (!this.session) return;
      const labeled =
        `[Room message from ${from}, sent while the push review was still running. ` +
        `Discussion only: it answers no waiting question.]\n${text}`;
      if (this.handoffGuard?.active) {
        this.heldDuringHandoff.push(labeled);
        return;
      }
      this.turnActive = true;
      this.session.send(labeled);
      return;
    }
    // MODIFIED-BY: [SCOPE 159 / T005] — the three waiting gates (push, agent gate, Autopilot question) take an answer only from a Room Approver checked by user id, or from KAIN relaying one (FR-004)
    // While a push confirmation is pending, the next message IS the decision (lenient yes/no) — never
    // relay it to the AI session, which is hard-blocked from pushing and would report "blocked".
    // [SCOPE 134 / T018] Same rule for an agent-initiated gate; [SCOPE 154 / T013] and for a unit
    // session's live gate question (control words pass through, T015).
    if (this.waitingGate(text) && text.toUpperCase() !== "CANCEL REMOTE") {
      const apply = (who: { ok: true; name: string } | { ok: false }): void => {
        if (who.ok) this.settleGate(text, who.name);
        else this.refuseGateAnswer(text);
      };
      const checked = this.checkApprover(msg);
      if (checked instanceof Promise) void checked.then(apply);
      else apply(checked);
      return;
    }
    // [SCOPE 154 / T004] While a skip cascade's "keep <nums>" / "keep none" question is pending,
    // the next message IS that answer — checked before the startup list's own "go"/"no" parser
    // below, since the list is still awaiting go while this question is open.
    if (this.pendingSkipCascade && text.toUpperCase() !== "CANCEL REMOTE") {
      this.resolvePendingSkipCascade(text);
      return;
    }
    // [SCOPE 154 / T003] While a startup list is awaiting the owner's "go", the next message IS
    // that decision (FR-002) — the owner's "go" is the run's approval, nothing further is asked.
    // MODIFIED-BY: [SCOPE 154 / T004] — a "skip <num>" reply removes one listed scope and runs
    // its cascade instead of being parsed as a go/no-go answer.
    // MODIFIED-BY: [SCOPE 159 / T004] — a waiting list takes only go, no or skip unless the old-path switch is on (FR-003, FR-017)
    // MODIFIED-BY: [SCOPE 159 / T005] — the list's answer is checked by user id like every other gate (FR-004)
    if (this.autopilot?.isAwaitingGo && listTakesMessage(text, this.oldInbound)) {
      const answer = (who: { ok: true; name: string } | { ok: false }): void => {
        if (!who.ok) {
          this.refuseGateAnswer(text);
          return;
        }
        const skipNum = this.trySkipCommand(text);
        if (skipNum) {
          void this.handleSkipCommand(skipNum);
          return;
        }
        this.resolvePendingAutopilotGo(text);
      };
      const checked = this.checkApprover(msg);
      if (checked instanceof Promise) void checked.then(answer);
      else answer(checked);
      return;
    }
    // [SCOPE 142 / T025] A queue answer (DQ-nn) or a review verdict (KR-nnnn) is recorded here,
    // where the author is still known: the supervisor's tag was stripped above, so the session
    // could never tell the owner's answer from the supervisor's.
    // [SCOPE 144 / T010] A person's reply is checked against the Room Approvers first (FR-008).
    if (this.handleDecision(text, m.isAgent ? from : "owner", m.isAgent ? undefined : (m.authorId ?? ""))) return;
    if (this.handleControl(text)) return;
    if (!this.session) {
      console.log("[bridge] message before session ready — ignored:", text.slice(0, 60));
      return;
    }
    // [SCOPE 159 / T014] A [HANDOFF] typed by a person is no longer special: it is an ordinary instruction (FR-065).
    // [SCOPE 149 / T007] While a handoff turn runs, an instruction waits for it to end, so the
    // guard never applies to it and it never folds into the context-only turn.
    if (this.handoffGuard?.active) {
      this.heldDuringHandoff.push(text);
      return;
    }
    console.log(`[bridge] operator → session: ${text.slice(0, 80)}`);
    this.turnActive = true;
    this.session.send(text);
  }

  // [SCOPE 159 / T005] BEGIN — Who may answer a waiting gate (FR-004)
  /** True while a push, an agent gate or a live Autopilot question is waiting for this text. */
  private waitingGate(text: string): boolean {
    return !!this.pendingPush || !!this.pendingApproval || (!!this.pendingAutopilotGate && !isQuestionPassThrough(text));
  }

  /**
   * An answer counts from a person checked by user id (active company ADMIN or Project
   * TEAM_MANAGER, via the approver route), or from KAIN relaying one: KAIN's relay is recorded as
   * KAIN's, as the contract says until the mailbox carries `answeredBy`. A person's post with no
   * user id fails closed in project-agent mode.
   */
  private checkApprover(msg: InboundMessage): { ok: true; name: string } | { ok: false } | Promise<{ ok: true; name: string } | { ok: false }> {
    if (msg.roomAgent) return { ok: true, name: msg.from };
    // A post with no user id (a console or a room that gives none) keeps the old path, the same
    // rule SPEC-144 T010 uses for DQ and KR (decision-reply). The room always gives an id for a person.
    if (!msg.authorId) return { ok: true, name: msg.from };
    return this.approverLookup(msg.authorId).then(
      (who) => (who.approver && who.name ? { ok: true as const, name: who.name } : { ok: false as const }),
      () => ({ ok: false as const }),
    );
  }

  private settleGate(text: string, from: string): void {
    if (this.pendingPush) this.resolvePendingPush(text);
    else if (this.pendingApproval) this.resolvePendingApproval(text, from);
    else if (this.pendingAutopilotGate) this.resolvePendingAutopilotGate(text, from);
  }

  /** A non-approver's text settles nothing: the room is told once, the gate keeps waiting, the session sees it as discussion. */
  private refuseGateAnswer(text: string): void {
    void this.post(NOT_RECORDED_NOTE);
    if (!this.session) return;
    const labeled = notRecordedRelay(text);
    if (this.handoffGuard?.active) {
      this.heldDuringHandoff.push(labeled);
      return;
    }
    this.turnActive = true;
    this.session.send(labeled);
  }
  // [SCOPE 159 / T005] END

  // A person's post (authorId set) is recorded only for a Room Approver; otherwise a room note,
  // and the text goes to the session as discussion.
  private handleDecision(text: string, by: string, authorId?: string): boolean {
    const reply = decisionReplyFor(this.opts.cwd, text);
    if (!reply) return false;
    process.stdout.write(`[bridge] decision reply from ${by}: ${text.slice(0, 80)}\n`);
    const run = nodeRunner(this.opts.cwd);
    const outcome: Promise<HumanDecisionOutcome> =
      authorId === undefined
        ? handleDecisionReply(reply, by, run)
        : handleHumanDecision(reply, text, authorId, this.approverLookup, run);
    void outcome
      .then((o) => {
        if (o.roomText) void this.post(o.roomText);
        const toSession = o.sessionText ?? o.relayText;
        if (toSession && this.session) {
          this.turnActive = true;
          this.session.send(toSession);
        }
      })
      .catch((err: unknown) => {
        // [SCOPE 144 / T030] Nothing was recorded; say so in the log, masked (FR-018).
        const reason = maskReason(err instanceof Error ? err.message : String(err)) ?? "unknown";
        this.roomLinkLogger().error({ event: "decision-failed", by, reason }, "decision reply could not be handled");
      });
    return true;
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
  // MODIFIED-BY: [SCOPE 149 / T007] — STOP lifts the handoff guard and drops what it held (FR-007)
  private handleControl(text: string): boolean {
    switch (text.toUpperCase()) {
      case "STOP":
        void this.post(this.stopHandoffTurn()); // [SCOPE 149 / T007]
        void this.session?.interrupt();
        this.turnActive = false;
        return true;
      case "CONTINUE":
        this.turnActive = true;
        this.session?.send("Continue.");
        return true;
      // MODIFIED-BY: [SCOPE 154 / T008] — while an Autopilot run is active, STATUS returns the
      // same heartbeat content early (FR-007) instead of the plain connection status line.
      // MODIFIED-BY: [SCOPE 154 / T015] — STATUS re-posts a waiting question, or brings back the oldest
      // parked one when none waits (FR-015). The run's heartbeat already carries a waiting question.
      case "STATUS":
        if (this.pendingAutopilotGate) {
          if (this.autopilotRunAbort) this.postHeartbeat();
          else void this.post(formatQuestionReminder(this.pendingAutopilotGate));
          return true;
        }
        if (this.autopilotRunAbort) this.postHeartbeat();
        if (this.bringBackParkedQuestion()) return true;
        if (!this.autopilotRunAbort) void this.post(this.statusLine());
        return true;
      // [SCOPE 154 / T009] PAUSE/RESUME an active Autopilot run (FR-008). Outside a run these
      // fall through as ordinary text, same as CONFIRMED/NO with no pending push.
      case "PAUSE":
        if (!this.autopilotRunAbort) return false;
        this.autopilotPaused = true;
        void this.post("Autopilot: paused. Reply \"resume\" to continue.");
        return true;
      case "RESUME":
        if (!this.autopilotRunAbort) return false;
        this.autopilotPaused = false;
        void this.post("Autopilot: resumed.");
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
      // MODIFIED-BY: [SCOPE 148 / T012] — TRIAGE runs the feedback sweep (FR-002)
      // Whole message, any casing, and the supervisor's tag was already stripped upstream, so
      // KAIN's "[KAIN] TRIAGE" arrives here as plain TRIAGE. With no schedule (an operator
      // bridge, or a non-sink project that never armed) it falls through as ordinary text
      // rather than being swallowed: SCOPE-102's behavior is unchanged where triage is absent.
      case "TRIAGE":
        if (!this.triage) return false;
        void this.triage.trigger();
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

  // [SCOPE 154 / T008] BEGIN — the 15-minute heartbeat and the 18:00 full summary (FR-007).
  // Built on the run-state file (AutopilotRunState, T004/T007), not a second summarizer — see the
  // header note in autopilot-heartbeat.ts. The tick reads the run state fresh every time, so a
  // concurrent edit from the pipeline (recordOutcome's saveAutopilotState) is always picked up.
  private postHeartbeat(): void {
    const state = loadAutopilotState(this.opts.cwd);
    // MODIFIED-BY: [SCOPE 154 / T015] — the heartbeat repeats a waiting question (FR-015)
    const result = buildHeartbeat({
      state,
      paused: this.autopilotPaused,
      previouslyPosted: this.heartbeatPostedScopes,
      waitingQuestion: this.pendingAutopilotGate ? toAutopilotQuestion(this.pendingAutopilotGate) : undefined,
    });
    this.heartbeatPostedScopes = result.postedScopes;
    void this.post(result.message).then((ok) => {
      if (ok) this.lastHeartbeatPostOkAt = new Date(); // [SCOPE 154 / T009]
    });
  }

  // [SCOPE 154 / T009] BEGIN — the outage check, run every tick alongside the heartbeat itself
  // (FR-008). Posts at most one "missed" line per outage and one "back" line on return.
  private checkOutage(): void {
    const missed = isHeartbeatMissed(this.autopilotRunAbort !== undefined, this.autopilotPaused, this.lastHeartbeatPostOkAt, new Date());
    const step = stepOutage(this.outageAlerting, missed);
    this.outageAlerting = step.alerting;
    if (step.verdict === "missed") void this.post(formatHeartbeatMissed(this.opts.projectName));
    else if (step.verdict === "back") void this.post(formatHeartbeatBack(this.opts.projectName));
  }
  // [SCOPE 154 / T009] END

  private postFullSummary(): void {
    const result = buildFullSummary(loadAutopilotState(this.opts.cwd));
    this.heartbeatPostedScopes = result.postedScopes;
    void this.post(result.message);
  }

  /** One clock read every AUTOPILOT_HEARTBEAT_MS: the heartbeat, and the 18:00 summary if due. */
  private heartbeatTick(): void {
    this.postHeartbeat();
    this.checkOutage(); // [SCOPE 154 / T009]
    const now = new Date();
    const today = localDate(now);
    if (now.getHours() === AUTOPILOT_SUMMARY_HOUR && this.lastFullSummaryDate !== today) {
      this.lastFullSummaryDate = today;
      this.postFullSummary();
    }
  }

  /** Called at the start of a run. Resets what counts as "already posted" for this run only. */
  private startHeartbeat(): void {
    this.heartbeatPostedScopes = [];
    this.lastFullSummaryDate = undefined;
    // MODIFIED-BY: [SCOPE 154 / T009] — reset pause and outage state for the new run; a run just
    // started counts as having just posted, so an immediate 20-minute-silence false alarm can't fire.
    this.autopilotPaused = false;
    this.outageAlerting = false;
    this.lastHeartbeatPostOkAt = new Date();
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), AUTOPILOT_HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
  // [SCOPE 154 / T008] END

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
  // MODIFIED-BY: [SCOPE 148 / T012] — recordDecision files through the shared token holder (FR-016)
  // MODIFIED-BY: [SCOPE 144 / T026] — marks the request asked once its question is posted, for the reconnect re-ask (FR-020)
  // MODIFIED-BY: [SCOPE 144 / T031] — the review's outcome touches only its own request; an abandoned request posts no question (FR-021)
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
      // [SCOPE 144 / T031] This request's own entry: the review's outcome touches only it, never
      // a later request that took the slot after this one was abandoned mid-review.
      const entry: NonNullable<RemoteBridge["pendingApproval"]> = { resolve, request };
      this.pendingApproval = entry;
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
              if (this.pendingApproval === entry) this.pendingApproval = undefined; // [SCOPE 144 / T031]
              void this.post(
                `Review is NOT clean — refusing the push without asking.\n${verdict.summary ?? ""}`.trim(),
              );
              resolve(false);
              return;
            }
            reviewNote = "Review clean. ";
          } catch (err) {
            // A review that cannot run is not a review that passed.
            if (this.pendingApproval === entry) this.pendingApproval = undefined; // [SCOPE 144 / T031]
            void this.post(`Could not run the pre-push review — refusing. ${(err as Error).message}`);
            resolve(false);
            return;
          }
        }

        // [SCOPE 144 / T031] Refused while the review ran (teardown, lost room): nothing to ask.
        if (this.pendingApproval !== entry) return;
        entry.asked = true; // [SCOPE 144 / T026]
        this.gateRaisers.raise(`agent-gate:${request.detail}`, { kind: "agent", id: this.opts.agent?.name ?? "agent" }); // [SCOPE 159 / T006] FR-029
        void this.post(
          [
            `${this.agentLabel()} is asking to run a gated action.`,
            ``,
            `  ${request.detail}`,
            ``,
            `${reviewNote}Reply CONFIRMED to allow, or NO to refuse` +
            // [SCOPE 159 / T005] only a Room Approver answers; the supervisor may relay one (FR-004)
            (this.opts.supervisor ? ` (a Room Approver, or ${this.opts.supervisor} relaying one).` : `.`),
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

  // [SCOPE 154 / T013] BEGIN — the Autopilot unit's live gate round trip (ctx.resolveGate's
  // fallback, used when neither the ledger nor the scope's own text answers a question).
  // Direct template: the pendingApproval quartet just above. The key difference: the resolved
  // value is a free-text decision plus the replying human's name (never the supervisor — see
  // resolvePendingAutopilotGate — since a live-answered gate is persisted to the ledger, and
  // the ledger's own validation rejects "kain"/the agent as an approver).
  // MODIFIED-BY: [SCOPE 154 / T015] — a question is re-posted at 10 min and auto-parks at 15 min;
  // a second question is kept for `status` instead of dropped (FR-015)
  /** Surface a unit's unanswerable gate question to the room and resolve with the owner's answer. */
  private requestAutopilotGate(scopeNum: string, question: string): Promise<{ decision: string; from: string } | undefined> {
    if (this.pendingAutopilotGate) {
      this.parkedAutopilotQuestions.push({ scopeNum, question, askedAt: new Date() });
      void this.post(
        `Another Autopilot question is already waiting — SCOPE-${scopeNum}'s is parked for now. Reply "status" later to bring it back.`,
      );
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const gate: PendingAutopilotQuestion = { resolve, scopeNum, question, askedAt: new Date() };
      this.pendingAutopilotGate = gate;
      this.armAutopilotQuestionTimers(gate);
      void this.post(formatQuestionAsked(gate));
    });
  }

  private resolvePendingAutopilotGate(text: string, from?: string): void {
    const p = this.pendingAutopilotGate;
    if (!p) return;
    this.pendingAutopilotGate = undefined;
    this.clearAutopilotQuestionTimers(); // [SCOPE 154 / T015]
    if (text.trim().toUpperCase() === "PARK") {
      void this.post("Parked — left for the owner.");
      p.resolve(undefined);
      return;
    }
    void this.post("Got it — recording that answer.");
    // Never falls back to this.opts.supervisor: that is "KAIN" in project-agent mode, and the
    // ledger's own validation (_wxAI/askgate/ledger.mjs's AGENT_APPROVERS) rejects the agent as
    // an approver of its own gate.
    p.resolve({ decision: text.trim(), from: from ?? "Operator" });
  }

  /** Refuse (park) anything still waiting. Called on teardown and on losing the room. */
  private abandonPendingAutopilotGate(reason: string): void {
    const p = this.pendingAutopilotGate;
    if (!p) return;
    this.pendingAutopilotGate = undefined;
    this.clearAutopilotQuestionTimers(); // [SCOPE 154 / T015]
    void reason;
    p.resolve(undefined);
  }
  // [SCOPE 154 / T013] END

  // [SCOPE 154 / T015] BEGIN — a waiting question never hangs the run (FR-015)
  // MODIFIED-BY: [SCOPE 144 / T030] — no timers while the room link is down; the reconnect re-ask arms them (FR-020)
  // Two posts (the ask, then a last call at 10 min), auto-park at 15 min, and `status` brings a
  // parked question back. An answer to a brought-back question goes to decisions/ledger.yaml and,
  // when its scope already ended parked in this run, queues that scope once more at the end.
  private armAutopilotQuestionTimers(gate: PendingAutopilotQuestion): void {
    this.clearAutopilotQuestionTimers();
    if (this.roomLinkDown) return; // [SCOPE 144 / T030] an outage holds the gate
    const lastCall = setTimeout(() => {
      if (this.pendingAutopilotGate === gate) void this.post(formatQuestionLastCall(gate));
    }, AUTOPILOT_QUESTION_LAST_CALL_MS);
    const park = setTimeout(() => this.autoParkAutopilotQuestion(gate), AUTOPILOT_QUESTION_PARK_MS);
    lastCall.unref?.();
    park.unref?.();
    this.autopilotQuestionTimers = [lastCall, park];
  }

  private clearAutopilotQuestionTimers(): void {
    for (const t of this.autopilotQuestionTimers) clearTimeout(t);
    this.autopilotQuestionTimers = [];
  }

  private autoParkAutopilotQuestion(gate: PendingAutopilotQuestion): void {
    if (this.pendingAutopilotGate !== gate) return;
    this.pendingAutopilotGate = undefined;
    this.clearAutopilotQuestionTimers();
    void this.post(formatQuestionAutoParked(gate));
    // A brought-back question re-parks through its own resolver; a live one is kept here.
    if (!gate.broughtBack) this.parkedAutopilotQuestions.push(toAutopilotQuestion(gate));
    gate.resolve(undefined);
  }

  /** Re-open the oldest parked question. False when none is parked. */
  private bringBackParkedQuestion(): boolean {
    const q = this.parkedAutopilotQuestions.shift();
    if (!q) return false;
    const gate: PendingAutopilotQuestion = {
      ...q,
      broughtBack: true,
      resolve: (answer) => {
        if (answer) void this.recordBroughtBackAnswer(q, answer);
        else this.parkedAutopilotQuestions.push(q);
      },
    };
    this.pendingAutopilotGate = gate;
    this.armAutopilotQuestionTimers(gate);
    void this.post(formatQuestionBroughtBack(q));
    return true;
  }

  private async recordBroughtBackAnswer(q: AutopilotQuestion, answer: { decision: string; from: string }): Promise<void> {
    try {
      await nodeLedgerWriter(this.opts.cwd)(q.scopeNum, q.question, answer.decision, answer.from);
    } catch (err) {
      void this.post(
        `⚠ Could not record SCOPE-${q.scopeNum}'s answer in decisions/ledger.yaml — ${(err as Error).message.slice(0, 160)}`,
      );
      return;
    }
    void this.post(this.requeueAnsweredUnit(q.scopeNum));
  }

  /** What happens to the answered scope now, as the room line that says so. */
  private requeueAnsweredUnit(scopeNum: string): string {
    const head = "Recorded in decisions/ledger.yaml.";
    if (!this.autopilotRunUnits) return `${head} The next run of SCOPE-${scopeNum} will use it.`;
    if (this.autopilotRequeued.has(scopeNum)) return `${head} SCOPE-${scopeNum} is already queued to run once more.`;
    if (this.autopilotRunOutcomes.get(scopeNum) === "parked" && this.queueUnitOnceMore(scopeNum)) {
      return `${head} SCOPE-${scopeNum} runs once more at the end of this run, with your answer.`;
    }
    if (this.autopilotRunCurrent === scopeNum) {
      this.autopilotRequeueWhenParked.add(scopeNum);
      return `${head} SCOPE-${scopeNum} is still running; if it ends parked, it runs once more at the end of this run.`;
    }
    return `${head} SCOPE-${scopeNum} will use it when it runs.`;
  }

  /** Append the scope to the running list — once per run. */
  private queueUnitOnceMore(scopeNum: string): boolean {
    const units = this.autopilotRunUnits;
    if (!units || this.autopilotRequeued.has(scopeNum)) return false;
    const unit = units.find((u) => u.num === scopeNum);
    if (!unit) return false;
    this.autopilotRequeued.add(scopeNum);
    units.push(unit);
    return true;
  }

  /** Last word to the room before the process exits on a crash (main.ts). Never throws, never waits past 3s. */
  async reportCrash(text: string): Promise<void> {
    try {
      await Promise.race([this.post(text), new Promise((resolve) => setTimeout(resolve, 3000).unref?.())]);
    } catch {
      // the crash log already has it
    }
  }
  // [SCOPE 154 / T015] END

  // [SCOPE 134 / T019] File the decision. Only a grant names a grantor — a refusal
  // (including abandon-on-teardown) has no approving human, and the MCP tool rejects a
  // grant without one, which is the constitution's "never self-approved" made concrete.
  private recordDecision(request: OverrideRequest, granted: boolean): void {
    const agent = this.opts.agent;
    const decider = this.lastDecider;
    this.lastDecider = undefined;
    if (!agent) return; // operator-driven bridge: no agent token to file with
    const rec: Parameters<typeof recordOverride>[2] = {
      projectId: agent.projectId,
      agentName: agent.name,
      sessionId: this.session?.id,
      action: request.action,
      granted,
      grantedBy: granted ? decider ?? "operator" : undefined,
      requestText: request.detail,
    };
    // [SCOPE 148 / T012] FR-016: through the shared holder — renewed near expiry, and renewed
    // and retried once when the MCP answers 401 (revoked, expired, or replaced elsewhere).
    const filed = this.tokens
      ? this.tokens.withToken((t) => recordOverride(agent.mcpUrl, t, rec), { isRejected: (r) => r.status === 401 })
      : recordOverride(agent.mcpUrl, agent.mcpToken, rec);
    void filed.then((r) => {
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

  // [SCOPE 154 / T003] The owner's reply to the posted startup list. "go" (lenient yes/no, same
  // parser as the push confirmation) IS the approval (FR-002) — nothing further is asked before
  // T004 onward hands the approved scopes to the skip cascade and the per-scope pipeline.
  // MODIFIED-BY: [SCOPE 154 / T015] — "go debug" starts the run with the step feed on (FR-017)
  private resolvePendingAutopilotGo(text: string): void {
    const debug = /^go\s+debug[.!]*$/i.test(text.trim());
    const decision = debug ? true : parseYesNo(text);
    if (decision === true) {
      const scopes = this.autopilot?.confirmGo() ?? [];
      process.stdout.write(`[autopilot] go received — ${scopes.length} scope(s) approved${debug ? " (debug feed on)" : ""}\n`);
      if (debug) this.verbose = true;
      const feed = debug ? ` Debug feed on — every step each scope's session takes will post here; "concise" turns it off.` : "";
      void this.post(`Autopilot: starting on ${scopes.length} scope${scopes.length === 1 ? "" : "s"}.${feed}`);
      if (scopes.length > 0) void this.runAutopilotPipeline(scopes);
    } else if (decision === false) {
      this.autopilot?.confirmGo();
      void this.post("Autopilot startup cancelled.");
    } else {
      void this.post('Reply "go" to start Autopilot on this list, or "no" to cancel.');
    }
  }

  // [SCOPE 154 / T004] BEGIN — skip cascade room wiring (FR-003). "skip <num>" only applies while
  // a startup list is awaiting "go" (checked by the caller in onRoomMessage); matches a bare
  // scope number, same loose shape as the devplan's own "SCOPE-NNN" rows.
  private trySkipCommand(text: string): string | undefined {
    const m = /^skip\s+(\d+)\s*$/i.exec(text.trim());
    return m ? m[1] : undefined;
  }

  private async handleSkipCommand(scopeNum: string): Promise<void> {
    const scope = this.autopilot?.skip(scopeNum);
    if (!scope) {
      void this.post(`SCOPE-${scopeNum} is not on the pending startup list.`);
      return;
    }
    const agent = this.opts.agent;
    const stageOf =
      agent && this.tokens
        ? async (num: string) => {
            try {
              return await this.tokens!.withToken((t) => fetchScopeStage({ mcpUrl: agent.mcpUrl, mcpToken: t, projectId: agent.projectId }, num));
            } catch {
              return undefined;
            }
          }
        : undefined;
    const { message } = await runSkipCascade({ root: this.opts.cwd, scopeNum, title: scope.title, stageOf });
    this.pendingSkipCascade = { scopeNum, title: scope.title };
    void this.post(message);
  }

  /** The owner's reply to a skip cascade post — "keep <nums>" or "keep none" (FR-003). */
  private resolvePendingSkipCascade(text: string): void {
    const p = this.pendingSkipCascade;
    if (!p) return;
    const keep = parseKeepReply(text);
    if (keep === undefined) {
      void this.post('Reply "keep <scope numbers>" for the ones safe to keep, or "keep none" to skip them all too.');
      return;
    }
    this.pendingSkipCascade = undefined;
    const state = applyKeepDecision(loadAutopilotState(this.opts.cwd), p.scopeNum, keep);
    saveAutopilotState(this.opts.cwd, state);
    void this.post(keep.length > 0 ? `Keeping SCOPE-${keep.join(", SCOPE-")}.` : "Skipping all dependent scopes too.");
  }
  // [SCOPE 154 / T004] END

  // [SCOPE 154 / T006] BEGIN — reads a scope's own specs/<NNN>-*/spec.md text off disk so the
  // production-park gate (detectsGatedAction in autopilot-pipeline.ts) has text to inspect. No
  // MCP tool exposes a scope's FR/body text (confirmed: list_open_items's specs[] collection and
  // cockpit_summary's CockpitScopeDto both carry identity fields only, never
  // projectspecifications.content) — the bridge already runs inside the project's own checkout,
  // so this reads the file directly instead. Returns undefined on any miss (no matching folder,
  // no spec.md, unreadable) rather than throwing — a missing scope text degrades the gate check,
  // it must never abort the run.
  private readScopeText(num: string): string | undefined {
    try {
      const specsDir = join(this.opts.cwd, "specs");
      const match = readdirSync(specsDir, { withFileTypes: true }).find(
        (entry) => entry.isDirectory() && entry.name.startsWith(`${num}-`),
      );
      if (!match) return undefined;
      return readFileSync(join(specsDir, match.name, "spec.md"), "utf8");
    } catch {
      return undefined;
    }
  }
  // [SCOPE 154 / T006] END

  // [SCOPE 154 / T005] BEGIN — actually runs the approved scopes (FR-004). Previously, "go" only
  // posted a count and returned — confirmGo() consumed the schedule but nothing downstream ever
  // called runPipeline (autopilot-pipeline.ts). Wired here: one fresh unattended session per scope
  // (createAutopilotUnitRunner, autopilot-unit-runner.ts), run sequentially in the background so it
  // never blocks chat handling, with each outcome persisted to the existing run-state file and a
  // final summary posted to the room.
  // MODIFIED-BY: [SCOPE 154 / T006] — populate each unit's `text` from readScopeText() so the
  // pipeline's production-park gate check has the scope's own FR/acceptance text to inspect.
  // MODIFIED-BY: [SCOPE 154 / T015] — "working on" post per unit, debug step feed, park lines
  // filled, and an answered parked scope re-queued once (FR-015, FR-016, FR-017)
  private async runAutopilotPipeline(scopes: { num: string; title: string; stage: string }[]): Promise<void> {
    if (this.autopilotRunAbort) {
      void this.post("Autopilot: a run is already in progress — ignoring this go.");
      return;
    }
    const agent = this.opts.agent;
    if (!agent) {
      // Autopilot only ever arms in project-agent mode (see AutopilotSchedule construction),
      // which always carries `agent` — this is defensive, not expected to fire.
      void this.post("Autopilot: no agent connection — cannot start the pipeline.");
      return;
    }
    const abort = new AbortController();
    this.autopilotRunAbort = abort;
    this.startHeartbeat(); // [SCOPE 154 / T008]
    const units: PipelineUnit[] = scopes.map((s) => ({ num: s.num, title: s.title, text: this.readScopeText(s.num) }));
    const state = loadAutopilotState(this.opts.cwd);
    // [SCOPE 154 / T015] What a brought-back answer needs to re-queue its scope in this run.
    this.autopilotRunUnits = units;
    this.autopilotRunOutcomes.clear();
    this.autopilotRequeued.clear();
    this.autopilotRequeueWhenParked.clear();
    process.stdout.write(`[autopilot] pipeline starting — ${units.length} unit(s)\n`);
    try {
      const rawRunUnit = createAutopilotUnitRunner({
        repoRoot: this.opts.cwd,
        mcpUrl: agent.mcpUrl,
        mcpToken: agent.mcpToken,
        signal: abort.signal,
        // [SCOPE 154 / T015] FR-017: with "go debug" / verbose on, every step of the unit's session posts.
        onMessage: (msg) => {
          if (!this.verbose) return;
          for (const line of describeUnitMessage(msg)) void this.post(line);
        },
      });
      // [SCOPE 154 / T009] Pause blocks here, between units — never mid-unit, so a paused run
      // never leaves a unit half-worked. runPipeline itself (autopilot-pipeline.ts) is shared
      // with the non-Autopilot pipeline-agent command, so pause is layered on in this wrapper
      // rather than inside it.
      const runUnit: typeof rawRunUnit = async (unit, opts) => {
        while (this.autopilotPaused && !abort.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return rawRunUnit(unit, opts);
      };
      // [SCOPE 154 / T013] Ledger first (cheapest, no room round trip); only when that misses
      // does a unit's question reach a human, and only a live answer is persisted back.
      const ledgerResolver = nodeLedgerResolver(this.opts.cwd);
      const ledgerWriter = nodeLedgerWriter(this.opts.cwd);
      const gateResolver: GateResolver = async (scopeNum, question) => {
        const fromLedger = await ledgerResolver(scopeNum, question);
        if (fromLedger) return fromLedger;
        const live = await this.requestAutopilotGate(scopeNum, question);
        if (!live) return undefined;
        try {
          return await ledgerWriter(scopeNum, question, live.decision, live.from);
        } catch (err) {
          process.stdout.write(`[autopilot] gate answer could not be persisted to the ledger: ${(err as Error).message}\n`);
          return { decision: live.decision, ledgerId: "" };
        }
      };
      await runPipeline({
        units,
        runUnit,
        gateResolver,
        dependentsOf: nodeDependentsResolver(this.opts.cwd),
        projectName: this.opts.projectName, // [SCOPE 154 / T015] FR-016: park lines name the project
        // [SCOPE 154 / T003] Marks the unit about to run as the run's "current step" (FR-002/FR-014)
        // before runUnit is called, so the Cockpit never shows a stale currentScope mid-run.
        onUnitStart: (unit) => {
          const next = recordCurrentStep(state, unit.num, "running");
          state.currentScope = next.currentScope;
          state.currentStep = next.currentStep;
          state.stepStartedAt = next.stepStartedAt;
          saveAutopilotState(this.opts.cwd, state);
          // [SCOPE 154 / T015] FR-016: the room always knows which scope is being worked.
          this.autopilotRunCurrent = unit.num;
          void this.post(`Autopilot: working on SCOPE-${unit.num} — ${unit.title}.`);
        },
        recordOutcome: (record: UnitRunRecord) => {
          const next = recordUnitOutcome(state, record);
          state.units = next.units;
          saveAutopilotState(this.opts.cwd, state);
          process.stdout.write(`[autopilot] ${record.scope} → ${record.status}\n`);
          // [SCOPE 154 / T015] FR-015: an answer that arrived while this scope ran re-queues it once.
          this.autopilotRunOutcomes.set(record.scope, record.status);
          if (
            record.status === "parked" &&
            this.autopilotRequeueWhenParked.delete(record.scope) &&
            this.queueUnitOnceMore(record.scope)
          ) {
            void this.post(`Autopilot: SCOPE-${record.scope} runs once more at the end of this run, with your answer.`);
          }
        },
        post: (msg) => {
          void this.post(msg);
        },
      });
      const done = (state.units ?? []).filter((u) => u.status === "done").length;
      const failed = (state.units ?? []).filter((u) => u.status === "failed").length;
      const parked = (state.units ?? []).filter((u) => u.status === "parked").length;
      void this.post(`Autopilot: run finished — ${done} done, ${failed} failed, ${parked} parked.`);
      process.stdout.write(`[autopilot] pipeline finished — ${done} done, ${failed} failed, ${parked} parked\n`);
      this.postFullSummary(); // [SCOPE 154 / T008] FR-007: a full summary when the list finishes
    } catch (err) {
      void this.post(`Autopilot: run stopped with an error — ${(err as Error).message}`);
      process.stdout.write(`[autopilot] pipeline error: ${(err as Error).message}\n`);
    } finally {
      this.autopilotRunAbort = undefined;
      this.autopilotRunUnits = undefined; // [SCOPE 154 / T015]
      this.autopilotRunCurrent = undefined; // [SCOPE 154 / T015]
      this.stopHeartbeat(); // [SCOPE 154 / T008]
      // [SCOPE 154 / T003] A finished (or errored-out) run never leaves a stale currentScope/
      // currentStep/stepStartedAt behind for the Cockpit to show.
      const cleared = clearCurrentStep(state);
      state.currentScope = cleared.currentScope;
      state.currentStep = cleared.currentStep;
      state.stepStartedAt = cleared.stepStartedAt;
      saveAutopilotState(this.opts.cwd, state);
    }
  }
  // [SCOPE 154 / T005] END

  private async executePush(remote: string, branch: string): Promise<void> {
    console.log(`[push] executing: git push ${remote} ${branch}`);
    void this.post(`Pushing ${branch} → ${remote}…`);
    const res = await gitPush(this.opts.cwd, remote, branch);
    console.log(`[push] git push ok=${res.ok}`);
    void this.post(res.ok ? `✅ Pushed ${branch} → ${remote}\n${res.output}` : `❌ Push failed:\n${res.output}`);
  }
  // [SCOPE 102 / T008] END

  // [SCOPE 102 / T005] BEGIN — teardown notice (FR-009 seed; full CANCEL REMOTE in T009)
// MODIFIED-BY: [SCOPE 149 / T006] — arms the hand-off watcher and one-slot queue in project-agent mode; posts [HANDOFF] when free (FR-006, FR-008)
  async shutdown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;
    // [SCOPE 134 / T018] Refuse anything still waiting, FIRST. A gated action holding an
    // unresolved promise while the room goes away must end as a refusal, not as a session
    // that quietly proceeds once nobody is watching.
    this.abandonPendingApproval("bridge shutting down");
    this.abandonPendingAutopilotGate("bridge shutting down"); // [SCOPE 154 / T013]
    this.stopOutboxDrain?.();
    // [SCOPE 148 / T012] Disarm the tick. A run already in flight is its own session and is
    // left to finish or fail on its own: killing it mid-sweep is what leaves a partial report.
    this.triage?.stop();
    this.handoffWatcher?.stop(); // [SCOPE 149 / T006]
    this.handoffQueue?.stop();
    try {
      await this.post(`Claude on project ${this.opts.projectName} is disconnected`);
    } catch {
      /* best-effort */
    }
    this.session?.stop();
    this.client.dispose();
  }

  private async post(text: string): Promise<boolean> {
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
    return ok;
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
