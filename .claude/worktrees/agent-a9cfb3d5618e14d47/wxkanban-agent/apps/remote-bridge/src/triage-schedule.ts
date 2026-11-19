import { existsSync } from "fs";
import { join } from "path";
import {
  fetchProjectAgentSettings,
  refreshMcpToken,
  type ProjectAgentConfig,
  type ProjectAgentSettings,
} from "./agent-mode";
import { TRIAGE_DIR } from "./triage-hook";
import { localDate, runTriage, type TriageRunResult, type TriageTrigger } from "./triage-run";
import {
  checkForChange,
  formatFingerprint,
  scanQueue,
  type FingerprintSource,
  type NoChangeVerdict,
  type QueueScan,
} from "./triage-fingerprint"; // [SCOPE 148 / T013]
import { buildRoomSummary } from "./triage-summary"; // [SCOPE 148 / T014]
import { extractTriageSummary } from "./triage-run"; // [SCOPE 148 / T014]
import { TRIAGE_MIN_VALID_MS, type McpTokenHolder } from "./mcp-token"; // [SCOPE 148 / T012]

// [SCOPE 148 / T012] BEGIN — triage triggers, the sink gate and the one-run lock (SPEC-148 FR-001, FR-002)
//
// What starts a triage run, and what refuses to start a second one.
//
// Three triggers, one run path:
//
//   06:00      a daily tick, not a 24-hour timeout — see below
//   catch-up   on start, when today's run was due and no report exists
//   TRIAGE     the room says so, at once, with no no-change check (FR-003/T013)
//
// The 06:00 job is a MINUTE TICK that asks "is it past 06:00 and is today's report missing?",
// deliberately not a `setTimeout` to the next 06:00. A development laptop sleeps: a timeout armed
// for 14 hours' time does not fire while the machine is suspended and comes back at an arbitrary
// moment afterwards, so the one guarantee the operator wants — a report waiting in the morning —
// is the one a timeout cannot give. A tick that reads the clock fires on the first minute after
// wake instead, and needs no knowledge of whether the machine slept.
//
// That also makes "ran today" a fact on disk rather than state in memory: the report file IS the
// record (FR-002), so a restart cannot cause a second run and a crash cannot lose one. The 06:00
// and catch-up triggers therefore share one condition and differ only in the label they carry
// into the report and the routing log.
//
// This never touches the main session's input queue and never takes the worktree lock: a triage
// run is its own Agent SDK session (T011) and the room session goes on working beside it.
//
// The token (FR-016): with a holder, a run takes the SHARED bound token, renewed first when
// fewer than 3 hours are left, so the room gate's copy is never revoked behind its back. The
// fingerprint scan is the first thing to use it and makes a dozen MCP calls, so it doubles as the
// probe: a token that died early answers 401 there, the holder renews and the scan retries, and
// the run itself then starts on the live token. Without a holder (tests, older wiring) each run
// mints its own, as before.

/** Local hour the daily run becomes due. */
export const TRIAGE_HOUR = 6;

/** How often the clock is read. One minute is fine: the window it guards is an hour wide. */
export const TICK_MS = 60_000;

/**
 * How long to wait before retrying after a FAILED run. A failed run writes no report, so the
 * due-condition stays true and the bare tick would retry every minute for as long as the app or
 * the MCP is down — hammering a service that is already unwell and filling the room with the
 * same failure. One retry per half hour keeps the "the next trigger runs it again" promise
 * without that. TRIAGE ignores the cooldown: a human asking is not a retry loop.
 */
export const FAILURE_COOLDOWN_MS = 30 * 60_000;

/** FR-001: the fixed answer on a project that is not the feedback sink. */
export const NOT_SINK_MESSAGE = "Feedback triage runs only on the feedback-sink project";

export interface TriageScheduleOptions {
  repoRoot: string;
  config: ProjectAgentConfig;
  /** [SCOPE 148 / T013] The project the fingerprint's feedback calls are scoped to. */
  projectId: string;
  /** Posts to the room. Never given customer text (FR-008). */
  post: (text: string) => void | Promise<void>;
  /** FR-016: the bridge's one token holder, shared with the room gate. Absent = mint per run. */
  tokens?: Pick<McpTokenHolder, "get" | "withToken">;
  /** Test seams. */
  now?: () => Date;
  fetchSettings?: (cfg: ProjectAgentConfig) => Promise<ProjectAgentSettings>;
  refreshToken?: (cfg: ProjectAgentConfig) => Promise<{ token: string; expiresAt: string }>;
  run?: typeof runTriage;
  checkChange?: (repoRoot: string, src: FingerprintSource) => Promise<NoChangeVerdict>;
  scanNow?: (src: FingerprintSource) => Promise<QueueScan>;
}

const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Today's report, by the name T011 writes (FR-002: the file is the "ran today" record). */
export function reportExistsFor(repoRoot: string, date: string): boolean {
  return existsSync(join(repoRoot, TRIAGE_DIR, `BUG-Triage-${date}.md`));
}

export class TriageSchedule {
  private timer?: ReturnType<typeof setInterval>;
  private armed = false;
  private running?: { startedAt: Date; trigger: TriageTrigger };
  private lastFailureAt?: number;
  // [SCOPE 148 / T013] The local date the no-change check last said "skip". A skipped run
  // writes no report, so isDue() stays true for the rest of the day — without this the tick
  // would rebuild the fingerprint (12 MCP calls) every single minute until midnight.
  private noChangeOn?: string;
  private readonly now: () => Date;

  constructor(private readonly opts: TriageScheduleOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  /** True once the sink gate has passed and the tick is live. */
  get isArmed(): boolean {
    return this.armed;
  }

  get isRunning(): boolean {
    return this.running !== undefined;
  }

  /**
   * Read the sink gate, then arm. A project that is not the sink, and an app that cannot be
   * reached, both end the same way: no schedule, and the room told which of the two it was.
   * Unreachable is NOT retried into an armed state — an agent that silently starts triaging
   * hours after it said it would not is worse than one that stays off until it is restarted.
   */
  async start(): Promise<void> {
    let settings: ProjectAgentSettings;
    try {
      settings = await (this.opts.fetchSettings ?? fetchProjectAgentSettings)(this.opts.config);
    } catch (err) {
      await this.opts.post(
        `Feedback triage is off: the project settings could not be read (${(err as Error).message}). No daily run is scheduled.`,
      );
      return;
    }
    if (!settings.feedbackSink) {
      await this.opts.post(`${NOT_SINK_MESSAGE}. No daily run is scheduled.`);
      return;
    }

    this.armed = true;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // The tick must never be the reason the process stays alive; the room socket owns that.
    this.timer.unref?.();
    await this.opts.post(`Feedback triage is on: daily at 0${TRIAGE_HOUR}:00, or send TRIAGE.`);

    // Catch-up: the run was due and nothing wrote a report, so it was missed (FR-002).
    if (this.isDue()) await this.begin("catch-up");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.armed = false;
  }

  /** Past 06:00 local, and today has no report. */
  private isDue(at: Date = this.now()): boolean {
    if (at.getHours() < TRIAGE_HOUR) return false;
    return !reportExistsFor(this.opts.repoRoot, localDate(at));
  }

  /** One clock read. Public so tests drive it directly instead of waiting a minute. */
  async tick(): Promise<void> {
    if (!this.armed || this.running) return;
    const at = this.now();
    if (!this.isDue(at)) return;
    // [SCOPE 148 / T013] Already answered "no change" today; TRIAGE is the way to override it.
    if (this.noChangeOn === localDate(at)) return;
    if (this.lastFailureAt !== undefined && at.getTime() - this.lastFailureAt < FAILURE_COOLDOWN_MS) return;
    await this.begin("06:00");
  }

  /**
   * The room asked (FR-002). Always runs, with no no-change check and no cooldown — but still
   * one at a time, because a second concurrent run would write a second report for the same day
   * and both would be half-right about what had already been triaged.
   */
  async trigger(): Promise<void> {
    if (!this.armed) {
      await this.opts.post(NOT_SINK_MESSAGE);
      return;
    }
    if (this.running) {
      await this.opts.post(`Triage already running (started ${hhmm(this.running.startedAt)})`);
      return;
    }
    await this.begin("TRIAGE");
  }

  /** Take a live token, run, report the outcome. The lock is held for the whole of it. */
  private async begin(trigger: TriageTrigger): Promise<void> {
    const startedAt = this.now();
    this.running = { startedAt, trigger };
    const tokens = this.opts.tokens;
    try {
      let token: string;
      try {
        token = tokens
          ? await tokens.get(TRIAGE_MIN_VALID_MS)
          : (await (this.opts.refreshToken ?? refreshMcpToken)(this.opts.config)).token;
      } catch (err) {
        // A refusal here is usually meaningful (remote revoked, token expired), not transient.
        this.lastFailureAt = startedAt.getTime();
        await this.opts.post(`Feedback triage could not start: ${(err as Error).message}`);
        return;
      }

      // [SCOPE 148 / T013] The no-change check (FR-003). It runs AFTER the token refresh,
      // because it is the first thing that needs a working token, and the cheapest — twelve
      // model-free calls rather than an Opus sweep. TRIAGE skips the comparison but still
      // stamps a fingerprint, so tomorrow's check has something to compare against.
      const src: FingerprintSource = {
        mcpUrl: this.opts.config.mcpUrl,
        mcpToken: token,
        projectId: this.opts.projectId,
      };
      // FR-016: through the holder, a 401 on the scan renews the token and retries the scan once.
      const scanWith = <T>(f: (s: FingerprintSource) => Promise<T>): Promise<T> =>
        tokens ? tokens.withToken((t) => f({ ...src, mcpToken: t })) : f(src);
      let fingerprint: string | undefined;
      // [SCOPE 148 / T014] Customer titles, held only to replace an agent label that copies one.
      let titles: readonly string[] = [];
      try {
        if (trigger === "TRIAGE") {
          const scan = await scanWith((s) => (this.opts.scanNow ?? scanQueue)(s));
          fingerprint = formatFingerprint(scan.fingerprint);
          titles = scan.titles;
        } else {
          const verdict = await scanWith((s) => (this.opts.checkChange ?? checkForChange)(this.opts.repoRoot, s));
          if (!verdict.run) {
            this.noChangeOn = localDate(startedAt);
            await this.opts.post(`Triage: no change since ${verdict.since}`);
            return;
          }
          fingerprint = formatFingerprint(verdict.fingerprint);
          titles = verdict.titles;
        }
      } catch (err) {
        // A fingerprint that cannot be built must not cancel the run — it only means this
        // report carries no fingerprint, and tomorrow's check will run rather than skip.
        console.error(`[triage] fingerprint unavailable: ${(err as Error).message}`);
        fingerprint = undefined;
      }
      // The scan may have renewed the token on a 401; the run starts on whatever is live now.
      if (tokens) token = await tokens.get(TRIAGE_MIN_VALID_MS);

      const result: TriageRunResult = await (this.opts.run ?? runTriage)({
        repoRoot: this.opts.repoRoot,
        trigger,
        mcpUrl: this.opts.config.mcpUrl,
        mcpToken: token,
        notify: (t) => this.opts.post(t),
        now: this.now,
        fingerprint,
      });

      if (result.ok) this.lastFailureAt = undefined;
      else this.lastFailureAt = this.now().getTime();
      // [SCOPE 148 / T014] One post per run, rendered by the bridge from the report's own
      // summary block — never from the report prose, which carries customer words.
      if (result.ok) {
        await this.opts.post(
          buildRoomSummary({
            summary: extractTriageSummary(result.report),
            reportPath: result.reportPath,
            trigger,
            titles,
            blocks: result.blocks.length,
          }),
        );
      }
    } finally {
      this.running = undefined;
    }
  }
}
// [SCOPE 148 / T012] END
