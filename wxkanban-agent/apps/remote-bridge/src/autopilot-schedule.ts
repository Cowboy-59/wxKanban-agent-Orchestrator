import {
  fetchProjectAgentSettings,
  refreshMcpToken,
  type ProjectAgentConfig,
  type ProjectAgentSettings,
} from "./agent-mode";
import {
  buildStartupList,
  formatStartupList,
  NO_DEVPLAN_MESSAGE,
  NOTHING_TO_DO_MESSAGE,
  type AutopilotMcpSource,
  type StartupScope,
} from "./autopilot-startup"; // [SCOPE 154 / T003]
import { type McpTokenHolder } from "./mcp-token";

// [SCOPE 154 / T003] BEGIN — AutopilotSchedule (FR-002)
//
// On connect, read the Autopilot gate, then — if on — fetch the server devplan, filter it to
// scopes not yet done, and post the list to the room for the owner's "go". There is no clock and
// no fingerprint here, unlike TriageSchedule: a startup list is built once, at connect time, not
// on a daily tick, and there is no "no change since yesterday" question to ask of it.
//
// The owner's "go" is the run's approval (FR-002) — nothing further is asked before work starts.
// This class only gets as far as holding that pending list; consuming a "go" to actually start
// working the scopes (parseYesNo in the room-message handler, then T004's skip cascade onward)
// is wired in by the caller via `confirmGo()`.

/** A startup run is quick (one devplan read + a scope_stage call per scope), not a long watch. */
export const AUTOPILOT_MIN_VALID_MS = 60 * 60_000;

export interface AutopilotScheduleOptions {
  config: ProjectAgentConfig;
  /** The project the devplan and scope_stage calls are scoped to. */
  projectId: string;
  /** Posts to the room. */
  post: (text: string) => void | Promise<void>;
  /** The bridge's one token holder, shared with the room gate. Absent = mint per run. */
  tokens?: Pick<McpTokenHolder, "get" | "withToken">;
  /** Test seams. */
  fetchSettings?: (cfg: ProjectAgentConfig) => Promise<ProjectAgentSettings>;
  refreshToken?: (cfg: ProjectAgentConfig) => Promise<{ token: string; expiresAt: string }>;
  buildList?: (src: AutopilotMcpSource, fetchImpl?: typeof fetch) => Promise<StartupScope[] | null>;
}

export class AutopilotSchedule {
  private armed = false;
  private awaiting?: StartupScope[];

  constructor(private readonly opts: AutopilotScheduleOptions) {}

  /** True once the Autopilot gate passed and a devplan was found (whether or not it is empty). */
  get isArmed(): boolean {
    return this.armed;
  }

  /** True while a startup list has been posted and is waiting on the owner's "go". */
  get isAwaitingGo(): boolean {
    return this.awaiting !== undefined;
  }

  get pendingScopes(): readonly StartupScope[] | undefined {
    return this.awaiting;
  }

  /**
   * Read the Autopilot gate, then — if on — post the startup list or the reason there isn't one.
   * Mirrors TriageSchedule.start()'s shape: every failure posts one explanatory line and leaves
   * the schedule unarmed, never throws.
   */
  async start(): Promise<void> {
    let settings: ProjectAgentSettings;
    try {
      settings = await (this.opts.fetchSettings ?? fetchProjectAgentSettings)(this.opts.config);
    } catch (err) {
      await this.opts.post(`Autopilot is off: the project settings could not be read (${(err as Error).message}).`);
      return;
    }
    if (!settings.autopilotEnabled) {
      await this.opts.post("Autopilot is off for this project. No run starts.");
      return;
    }

    let token: string;
    try {
      token = this.opts.tokens
        ? await this.opts.tokens.get(AUTOPILOT_MIN_VALID_MS)
        : (await (this.opts.refreshToken ?? refreshMcpToken)(this.opts.config)).token;
    } catch (err) {
      await this.opts.post(`Autopilot could not start: ${(err as Error).message}`);
      return;
    }

    const src: AutopilotMcpSource = { mcpUrl: this.opts.config.mcpUrl, mcpToken: token, projectId: this.opts.projectId };
    const build = this.opts.buildList ?? buildStartupList;
    let scopes: StartupScope[] | null;
    try {
      scopes = this.opts.tokens ? await this.opts.tokens.withToken((t) => build({ ...src, mcpToken: t })) : await build(src);
    } catch (err) {
      await this.opts.post(`Autopilot could not read the dev plan: ${(err as Error).message}`);
      return;
    }

    if (scopes === null) {
      await this.opts.post(NO_DEVPLAN_MESSAGE);
      return;
    }
    this.armed = true;
    if (scopes.length === 0) {
      await this.opts.post(NOTHING_TO_DO_MESSAGE);
      return;
    }
    this.awaiting = scopes;
    await this.opts.post(formatStartupList(scopes));
  }

  /** The owner said "go" (FR-002). Returns the approved list once, then clears the wait. */
  confirmGo(): StartupScope[] | undefined {
    const scopes = this.awaiting;
    this.awaiting = undefined;
    return scopes;
  }

  // [SCOPE 154 / T004] The owner skipped one listed scope before "go" (FR-003) — removes it from
  // the pending list and returns it so the caller can run the skip cascade. undefined when no
  // list is pending, or the number names no listed scope.
  skip(scopeNum: string): StartupScope | undefined {
    if (!this.awaiting) return undefined;
    const idx = this.awaiting.findIndex((s) => s.num === scopeNum);
    if (idx < 0) return undefined;
    const [scope] = this.awaiting.splice(idx, 1);
    return scope;
  }
}
// [SCOPE 154 / T003] END
