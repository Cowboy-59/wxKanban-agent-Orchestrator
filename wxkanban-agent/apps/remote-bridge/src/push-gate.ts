import { execFile } from "child_process";
import { promisify } from "util";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadAgentSdk } from "./sdk-loader";

// [SCOPE 102 / T008] BEGIN — review-gated push helpers
// The bridged session is never allowed to `git push` (disallowedTools). Instead the
// operator triggers a push explicitly (the PUSH control word), the bridge runs a strict,
// read-only pre-push review, and only on a clean review + an explicit CONFIRMED does the
// bridge itself run `git push`. This encodes the standing rule "never push until the user
// says push" (FR-006): review-clean AND CONFIRMED, or nothing ships.

const execFileAsync = promisify(execFile);

export interface GitTarget {
  branch: string;
  remote: string;
}

export async function gitTarget(cwd: string): Promise<GitTarget> {
  const branch = (await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim();
  let remote = "origin";
  try {
    const remotes = (await execFileAsync("git", ["remote"], { cwd })).stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (remotes.length > 0 && !remotes.includes("origin")) remote = remotes[0];
  } catch {
    /* default to origin */
  }
  return { branch, remote };
}

export interface ReviewVerdict {
  clean: boolean;
  summary: string;
}

/**
 * Run a strict, read-only pre-push review as a one-shot sub-session. Edits are hard-blocked
 * so the reviewer cannot change the tree. The reviewer must end with `VERDICT: CLEAN` or
 * `VERDICT: FINDINGS`; anything ambiguous is treated as NOT clean (fail safe).
 */
export async function runReview(cwd: string, model?: string): Promise<ReviewVerdict> {
  const { query } = await loadAgentSdk();
  const prompt =
    "You are a STRICT, READ-ONLY pre-push reviewer. Do not edit anything. Inspect the changes about " +
    "to be pushed using `git status`, `git diff HEAD`, and (if it exists) `git log @{u}..HEAD`, applying " +
    "the wxUIUXCodeReview lens: correctness, security, data integrity, obvious UI/UX regressions, and tests. " +
    "Be conservative. Structure your reply as: (1) a 1-2 sentence summary of what you reviewed (the files/" +
    "areas and the gist of the change); (2) if there are any must-fix or should-fix findings, a short bulleted " +
    "list of them; (3) EXACTLY one final line — `VERDICT: CLEAN` when there are zero must-fix or should-fix " +
    "findings, otherwise `VERDICT: FINDINGS`. Keep it concise enough to read on a phone.";
  const q: Query = query({
    prompt,
    options: {
      cwd,
      model,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Reviewer is read-only and must never push or mutate the tree.
      disallowedTools: ["Bash(git push:*)", "Edit", "Write", "NotebookEdit", "MultiEdit"],
    },
  });

  let text = "";
  try {
    for await (const msg of q as AsyncIterable<SDKMessage>) {
      if (msg.type === "result") {
        const r = msg as Extract<SDKMessage, { type: "result" }>;
        if ("result" in r && typeof r.result === "string") text = r.result;
        break;
      }
    }
  } finally {
    try {
      q.close();
    } catch {
      /* ignore */
    }
  }

  const saysClean = /VERDICT:\s*CLEAN/i.test(text);
  const saysFindings = /VERDICT:\s*FINDINGS/i.test(text);
  const clean = saysClean && !saysFindings;
  return { clean, summary: text.trim().slice(0, 1500) || "(reviewer returned no output)" };
}

export interface PushResult {
  ok: boolean;
  output: string;
}

export async function gitPush(cwd: string, remote: string, branch: string): Promise<PushResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["push", remote, branch], { cwd });
    return { ok: true, output: `${stdout}${stderr}`.trim().slice(0, 1000) || "(no output)" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: (e.stderr || e.stdout || e.message || "push failed").trim().slice(0, 1000) };
  }
}
// [SCOPE 102 / T008] END
