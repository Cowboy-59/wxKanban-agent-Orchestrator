// [SCOPE 134 / T013] BEGIN — canUseTool override gate (the half that actually stops an action)
//
// The constitution (amended 2026-09-23) permits exactly one shape: a tool may REQUEST an
// override and may never SELF-APPROVE one. This module is where that becomes true rather
// than hoped for.
//
// WHY THIS IS canUseTool AND NOT A PROMPT INSTRUCTION
//
// The SDK calls `canUseTool` before every tool execution regardless of what the session
// has been told. An agent instructed "ask before pushing" is one prompt edit away from not
// asking, and the failure is invisible until it matters. An agent that physically cannot
// proceed is a different thing. `session.ts:9` has named this as the intended mechanism
// since SCOPE-102 and it has been unused; FR-009 tests it with the instruction absent,
// which is the only test that distinguishes a safeguard from a convention.
//
// DEFAULT-DENY
//
// Silence is not consent. Anything that is not an explicit grant — a denial, an abort, a
// throw inside the request path, a resolver that never settles and is then abandoned —
// results in the action not running. The SDK's own note is worth repeating: returning
// `null` means no control_response is sent and the tool stays blocked indefinitely, so
// this module never returns null; it returns an explicit deny with a reason.
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

/** The gated action classes. Deliberately two — see `classifyAction`. */
export type GatedAction = "gitpush" | "prodatawrite";

export interface OverrideRequest {
  action: GatedAction;
  toolName: string;
  /** The command or operation as the agent asked for it, for the operator to read. */
  detail: string;
}

export interface OverrideGateOptions {
  /**
   * Surface the request to a human and resolve with their answer. The bridge posts this
   * into the room; the operator replies there. Resolving `false`, rejecting, or never
   * settling all mean the action does not run.
   */
  requestApproval(request: OverrideRequest): Promise<boolean>;
  /** Called after every decision, granted or not, so the record is a by-product. */
  onDecision?(request: OverrideRequest, granted: boolean): void;
}

// [SCOPE 134 / T025] The gated list is SHORT on purpose, and this is the reasoning, kept
// here because it is the thing most likely to be "improved" away:
//
// A gate that fires constantly trains the operator to approve reflexively, which removes
// the safeguard while leaving it apparently in place. Two classes earn a prompt because
// they are the only ones that are irreversible from outside the working tree:
//
//   gitpush       a push deploys the app AND the hosted MCP to production, ~3-7 minutes,
//                 with no staging in front of it
//   prodatawrite  the local DATABASE_URL points at PRODUCTION; there is no migration
//                 ledger and no rehearsal environment
//
// Everything else — editing files, running tests, installing packages, reading anything —
// runs uninterrupted. Adding a third class is a deliberate edit here, never an inference.

/**
 * `git push`, as a command rather than as a substring in prose.
 *
 * The leading `(^|[;&|]|\s)` makes `git` a command position, so `git-push` in a sentence
 * does not match. The token group allows flags AND their values — `git -C /repo push` is
 * real and an earlier version missed it, because a group matching only `-flag` could not
 * consume `/repo`. Tokens exclude quotes, which is what keeps `git commit -m "push"` out:
 * the group stops at the quote and the literal `push` is then never reached.
 */
const GIT_PUSH = /(^|[;&|]|\s)git\s+(?:[^\s;&|"']+\s+){0,4}push(?=\s|$|[;&|])/i;

/**
 * Writes against the production database. Matched by recognisable shape rather than by
 * guessing at intent: a fuzzy matcher here would either miss the real cases or fire on
 * every mention of the word "database", and a noisy gate is a disabled gate.
 */
// NOTE on the flag matcher: `\b-c\b` does NOT work. Between a space and `-` there is no
// word boundary — both are non-word characters — so it never fires. An earlier version had
// exactly that bug and silently gated nothing. Anchor on whitespace instead.
const PROD_WRITE = [
  /drizzle-kit\s+push\b/i,
  /\bpsql\b[^\n]*(?:^|\s)-{1,2}c(?:ommand)?(?:\s|=)/i,
  /\bDATABASE_URL\b[^\n]*\b(?:psql|drizzle-kit)\b/i,
];

/**
 * Decide whether a tool call needs a grant. PURE — no I/O, no state, no session. This is
 * the part FR-009 pins: it behaves identically whether or not the agent was ever told to
 * ask, because nothing it reads comes from the prompt.
 *
 * Returns null when the call is not gated, which is the overwhelming majority.
 */
export function classifyAction(
  toolName: string,
  input: Record<string, unknown>,
): { action: GatedAction; detail: string } | null {
  // Every gated class today is expressed as a shell command. A future class that is not
  // would be matched on its own tool name here.
  if (toolName !== "Bash") return null;

  const command = typeof input.command === "string" ? input.command : "";
  if (!command) return null;

  if (GIT_PUSH.test(command)) return { action: "gitpush", detail: command };
  for (const pattern of PROD_WRITE) {
    if (pattern.test(command)) return { action: "prodatawrite", detail: command };
  }
  return null;
}

/** Human-readable reason attached to a refusal, so the agent knows why and can say so. */
export function denialMessage(action: GatedAction): string {
  return action === "gitpush"
    ? "Blocked: a push deploys the application and the hosted MCP to production with no staging. It needs an explicit grant from the operator, and none was given."
    : "Blocked: this writes to the production database, which has no rehearsal environment. It needs an explicit grant from the operator, and none was given.";
}

/**
 * Build the `canUseTool` callback.
 *
 * Non-gated calls are allowed without involving the operator at all — that is what keeps
 * the gate credible. A gated call suspends here until the operator answers.
 */
export function createOverrideGate(opts: OverrideGateOptions): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<PermissionResult> => {
    const hit = classifyAction(toolName, input);
    if (!hit) return { behavior: "allow", updatedInput: input };

    const request: OverrideRequest = {
      action: hit.action,
      toolName,
      detail: hit.detail,
    };

    // Already aborted before we even ask — refuse rather than prompt for something that
    // cannot run anyway.
    if (options.signal.aborted) {
      opts.onDecision?.(request, false);
      return { behavior: "deny", message: denialMessage(hit.action) };
    }

    let granted = false;
    try {
      // An abort while waiting resolves the race as a refusal. Without this the session
      // would sit on a promise nobody is going to settle.
      granted = await Promise.race([
        opts.requestApproval(request),
        new Promise<boolean>((resolve) => {
          options.signal.addEventListener("abort", () => resolve(false), { once: true });
        }),
      ]);
    } catch {
      // A throw in the approval path is a refusal, never an allow. The failure mode of a
      // broken room connection must be "nothing happens", not "everything is permitted".
      granted = false;
    }

    opts.onDecision?.(request, granted);

    return granted
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: denialMessage(hit.action) };
  };
}
// [SCOPE 134 / T013] END

// [SCOPE 134 / T035] BEGIN — the gate as a PreToolUse hook (the form that actually runs)
//
// FOUND LIVE 2026-09-25: `canUseTool` is NEVER consulted under permissionMode
// "bypassPermissions" — the SDK auto-approves first and says so
// (CLAUDE_SDK_CAN_USE_TOOL_SHADOWED). The bridge runs in bypass mode, so the gate above
// was never invoked, and supplying it had also lifted the hard `git push` block: push was
// UNGATED. Unit tests could not see it; they call the gate directly.
//
// A PreToolUse hook runs before EVERY tool call in EVERY permission mode, and its `deny`
// beats any allow rule loaded from settings — which matters, because an omitted
// `settingSources` loads user and project settings, and an allow rule there would also
// have pre-empted `canUseTool` in default mode. So the hook is the enforcement point;
// `createOverrideGate` above stays the decision logic it wraps.
//
// TIMEOUT. A hook has one, and a hook that times out is treated as a non-blocking error —
// the tool would RUN. So the hook enforces its own, shorter deadline and answers DENY
// when it passes. The SDK timeout is set a margin above it. 23 hours is effectively "no
// automatic timeout" (SCOPE-132 OQ-3) while guaranteeing the refusal always comes from
// us, never from the SDK giving up.

/** Seconds, handed to the SDK as the matcher timeout. */
export const GATE_HOOK_TIMEOUT_S = 24 * 60 * 60;
/** Our own deadline, a margin inside the SDK's, after which the answer is DENY. */
export const GATE_DECISION_DEADLINE_MS = 23 * 60 * 60 * 1000;

interface PreToolUseLike {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
}

interface HookResultLike {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason: string;
  };
}

/**
 * Wrap the gate as a PreToolUse hook callback. Non-gated calls get no opinion (`{}`), so
 * the hook changes nothing for the overwhelming majority of tool calls.
 */
export function createGateHook(
  opts: OverrideGateOptions,
  deadlineMs: number = GATE_DECISION_DEADLINE_MS,
): (input: PreToolUseLike, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookResultLike> {
  const gate = createOverrideGate(opts);
  return async (input, toolUseID, options) => {
    if (input.hook_event_name !== "PreToolUse" || !input.tool_name) return {};
    const toolInput = (input.tool_input && typeof input.tool_input === "object"
      ? input.tool_input
      : {}) as Record<string, unknown>;
    if (!classifyAction(input.tool_name, toolInput)) return {};

    // Abort on the SDK's signal OR our own deadline — whichever comes first — so the
    // refusal is always ours.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), deadlineMs);
    const onAbort = () => ac.abort();
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await gate(input.tool_name, toolInput, {
        signal: ac.signal,
        toolUseID: toolUseID ?? "",
        requestId: toolUseID ?? "",
      } as Parameters<CanUseTool>[2]);
      const allow = result?.behavior === "allow";
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: allow ? "allow" : "deny",
          permissionDecisionReason: allow ? "Granted in the project room." : (result as { message?: string }).message ?? "Refused.",
        },
      };
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
    }
  };
}
// [SCOPE 134 / T035] END
