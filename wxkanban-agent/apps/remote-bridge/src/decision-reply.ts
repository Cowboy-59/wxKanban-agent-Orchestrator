import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveApiToken } from "../../../core/http/mcp-client"; // [SCOPE 144 / T010]

// SPEC-142 Amendment A (FR-021, FR-023): a room reply that answers a parked question (DQ-nn) or
// reviews a KAIN answer (KR-nnnn) is recorded by the bridge, because only the bridge knows who
// wrote it. The [KAIN] tag is stripped before a message reaches the session, so the session can
// never tell the owner's answer from KAIN's. A human post is the owner; a [KAIN] post is KAIN.
// The recording itself is the Ask Gate's scripts (route.mjs, kain.mjs) in the project's kit.

export type DecisionReply =
  | { kind: "answer"; dq: string; answer: string }
  | { kind: "review"; kr: string; verdict: "approve" | "change" | "reject"; ownerAnswer: string };

export interface DecisionOutcome {
  /** Posted to the room; absent when the verdict post from the outbox already says it all. */
  roomText?: string;
  /** Sent to the session so it resumes or rechecks the units. */
  sessionText?: string;
}

export type Runner = (script: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

const DQ_RE = /^(DQ-\d+)\s*[:,.\-–—]?\s+([\s\S]+)$/i;
const KR_RE = /^(KR-\d+)\s+(approve|approved|reject|rejected|change|changed)\b\s*(?:to\b)?\s*[:\-–—]?\s*([\s\S]*)$/i;

// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function parseDecisionReply(text: string): DecisionReply | undefined {
  const t = text.trim();
  const kr = KR_RE.exec(t);
  if (kr) {
    const word = kr[2].toLowerCase();
    const verdict = word.startsWith("approve") ? "approve" : word.startsWith("reject") ? "reject" : "change";
    if (verdict === "change" && !kr[3].trim()) return undefined;
    return { kind: "review", kr: kr[1].toUpperCase(), verdict, ownerAnswer: kr[3].trim() };
  }
  const dq = DQ_RE.exec(t);
  if (dq && dq[2].trim()) return { kind: "answer", dq: dq[1].toUpperCase(), answer: dq[2].trim() };
  return undefined;
}
// [SCOPE 142 / T025] END

// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function askgateInstalled(root: string): boolean {
  return existsSync(join(root, "_wxAI", "askgate", "route.mjs")) && existsSync(join(root, "_wxAI", "askgate", "kain.mjs"));
}
// [SCOPE 142 / T025] END

/** True when docs/GOD-State.json has this queue item (in any status, so a late answer is told why). */
// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function hasQueueItem(root: string, dq: string): boolean {
  try {
    const state = JSON.parse(readFileSync(join(root, "docs", "GOD-State.json"), "utf8")) as { decisionQueue?: { id?: string }[] };
    return (state.decisionQueue ?? []).some((i) => i?.id === dq);
  } catch {
    return false;
  }
}
// [SCOPE 142 / T025] END

/** True when decisions/kain-replies.yaml has this reply. */
// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function hasReply(root: string, kr: string): boolean {
  try {
    return readFileSync(join(root, "decisions", "kain-replies.yaml"), "utf8").includes(`- id: "${kr}"`);
  } catch {
    return false;
  }
}
// [SCOPE 142 / T025] END

/** Is this message ours to record? Otherwise it is relayed to the session as before. */
// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function decisionReplyFor(root: string, text: string): DecisionReply | undefined {
  const reply = parseDecisionReply(text);
  if (!reply || !askgateInstalled(root)) return undefined;
  if (reply.kind === "answer" ? !hasQueueItem(root, reply.dq) : !hasReply(root, reply.kr)) return undefined;
  return reply;
}
// [SCOPE 142 / T025] END

// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
export function nodeRunner(root: string): Runner {
  return (script, args) =>
    new Promise((resolve) => {
      execFile(process.execPath, [join(root, "_wxAI", "askgate", script), ...args, "--root", root], { cwd: root }, (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
}
// [SCOPE 142 / T025] END

// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
function lastJson(stdout: string): Record<string, unknown> | undefined {
  const line = stdout.trim().split("\n").pop() ?? "";
  try {
    const whole = JSON.parse(stdout) as Record<string, unknown>;
    return whole;
  } catch {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}
// [SCOPE 142 / T025] END

/**
 * Record one reply. `by` is "owner" for a human post, or the supervisor's name for its tagged post.
 * The supervisor's answer goes on the owner's review list; the supervisor can never review.
 */
// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
// MODIFIED-BY: [SCOPE 144 / T010] — approvedBy (the Room Approver's name) goes to route.mjs and kain.mjs as --approved-by (FR-008)
// MODIFIED-BY: [SCOPE 159 / T021] — the session note names the answerer as a person on this Project's user list (FR-094)
export async function handleDecisionReply(reply: DecisionReply, by: string, run: Runner, approvedBy?: string): Promise<DecisionOutcome> {
  if (reply.kind === "review" && by !== "owner") {
    return { roomText: `${reply.kr}: only the owner reviews ${by}'s answers. That verdict was not recorded.` };
  }
  const approver = by === "owner" && approvedBy && approvedBy.trim() ? ["--approved-by", approvedBy.trim()] : [];
  const r =
    reply.kind === "answer"
      ? await run("route.mjs", ["answer", "--dq", reply.dq, "--answer", reply.answer, ...(by === "owner" ? approver : ["--by", by])])
      : await run("kain.mjs", ["review", reply.kr, reply.verdict, ...(reply.verdict === "change" ? [reply.ownerAnswer] : []), ...approver]);
  const res = lastJson(r.stdout);
  const id = reply.kind === "answer" ? reply.dq : reply.kr;
  if (!res || res.ok !== true) {
    const why = (res && typeof res.error === "string" && res.error) || r.stderr.trim() || "unknown error";
    return { roomText: `Could not record ${id}: ${why}` };
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");
  if (reply.kind === "answer") {
    const released = list(res.releases) || "none";
    if (by === "owner") {
      return {
        roomText: `Recorded your answer to ${reply.dq} as ${String(res.ledgerId ?? "a ledger decision")}. Released: ${released}.`,
        sessionText: `[decision] ${approver.length ? `${approver[1]} (a person on this Project's user list)` : "The owner"} answered ${reply.dq} in the room: "${reply.answer}". It is in the decision ledger as ${String(res.ledgerId)}. Resume the units it blocked: ${released}.`,
      };
    }
    return {
      roomText: `Recorded ${by}'s answer to ${reply.dq} as ${String(res.krId)} for the owner's review. It is not a ledger decision. Released: ${released}.`,
      sessionText: `[decision] ${by} answered ${reply.dq} in the room, acting for the owner: "${reply.answer}". Go on with it, but it is not an approved decision: it waits for the owner's review as ${String(res.krId)} and is never reused for another question. Resume the units it blocked: ${released}.`,
    };
  }
  const recheck = list(res.recheck);
  return recheck
    ? { sessionText: `[decision] The owner ${String(res.verdict)} ${reply.kr}${reply.verdict === "change" ? `, answering instead: "${reply.ownerAnswer}"` : ""}. Check the work done under it and correct it: ${recheck}.` }
    : {};
}
// [SCOPE 142 / T025] END

// [SCOPE 144 / T010] BEGIN — Room Approver check before a person's DQ answer or KR review is recorded (FR-008, contract C4)
// MODIFIED-BY: [SCOPE 144 / T030] — the note names consultant managers an engagement allows (FR-012); the relayed text is labeled not recorded
// MODIFIED-BY: [SCOPE 159 / T021] — any active person on the Project's user list decides; the note says so (FR-094)
// MODIFIED-BY: [SCOPE 159 / T025] — the note names consultants on the Project (FR-099)
// A person's post records a decision only when the app says its author may answer (any active
// person on this Project's user list, a company ADMIN, or a consultant on this Project). Anything
// else, including any failure to ask, is not recorded: the text still reaches the session, as discussion.
export interface ApproverResult {
  approver: boolean;
  name: string | null;
  role: string | null;
}

export type ApproverLookup = (yappchattUserId: string) => Promise<ApproverResult>;

export const NOT_RECORDED_NOTE =
  "Not recorded: only a person on this Project's user list, or a consultant on this Project, can decide.";

const NOT_APPROVER: ApproverResult = { approver: false, name: null, role: null };

type ApproverFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function httpApproverLookup(appBaseUrl: string, kitToken: string | null, fetchImpl: ApproverFetch = fetch as unknown as ApproverFetch): ApproverLookup {
  const base = appBaseUrl.replace(/\/+$/, "");
  return async (yappchattUserId) => {
    if (!kitToken || !yappchattUserId) return NOT_APPROVER;
    try {
      const res = await fetchImpl(`${base}/api/project-agent/approver?yappchattUserId=${encodeURIComponent(yappchattUserId)}`, {
        headers: { authorization: `Bearer ${kitToken}` },
      });
      if (!res.ok) return NOT_APPROVER;
      const body = (await res.json()) as { approver?: unknown; name?: unknown; role?: unknown };
      return {
        approver: body.approver === true,
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
        role: typeof body.role === "string" ? body.role : null,
      };
    } catch {
      return NOT_APPROVER;
    }
  };
}

export function defaultApproverLookup(root: string, env: NodeJS.ProcessEnv = process.env): ApproverLookup {
  const base = env.WXKANBAN_APP_BASE_URL?.trim() || "https://wxkanban.wxperts.com";
  return httpApproverLookup(base, resolveApiToken({ projectRoot: root, env }));
}

export interface HumanDecisionOutcome extends DecisionOutcome {
  /** Set when nothing was recorded: the post goes to the session as ordinary discussion. */
  relayText?: string;
}

/** A person's DQ answer or KR review: recorded under the approver's name, or a room note and a relay. */
export async function handleHumanDecision(
  reply: DecisionReply,
  text: string,
  authorId: string | undefined,
  lookup: ApproverLookup,
  run: Runner,
): Promise<HumanDecisionOutcome> {
  const who = authorId ? await lookup(authorId) : NOT_APPROVER;
  if (!who.approver || !who.name) return { roomText: NOT_RECORDED_NOTE, relayText: notRecordedRelay(text) }; // [SCOPE 144 / T030]
  return handleDecisionReply(reply, "owner", run, who.name);
}
// [SCOPE 144 / T010] END

// [SCOPE 144 / T030] BEGIN — a non-approver's DQ/KR text reaches the session labeled not recorded (FR-008)
export function notRecordedRelay(text: string): string {
  return `[${NOT_RECORDED_NOTE} This room post is discussion only, not an answer.]\n${text}`;
}
// [SCOPE 144 / T030] END
