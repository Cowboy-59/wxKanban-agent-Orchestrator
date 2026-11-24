// Transfer to agent (SPEC-159 FR-068..FR-072). Pure rules: the trigger, the transcript source, the
// masker-or-nothing refusal, the summary-or-"explain" pieces and the guards. Reading the newest
// transcript file is the only I/O, and only a transfer calls it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// [SCOPE 159 / T015] BEGIN — Trigger and asked-by (FR-068)
export type TransferAsker = { kind: "developer" } | { kind: "kain" };

export interface TransferTrigger {
  askedBy: TransferAsker;
  /** "explain" sends the masked lines; anything else sends the summary. */
  mode: "summary" | "explain";
}

const TRANSFER_PHRASE = /^\s*transfer\s+to\s+agent\s*[.!]?\s*$/i;
const KAIN_TRANSFER = /^\s*transfer\s*[.!]?\s*$/i;
/** The bare word only: "explain this" does not trigger. */
export const isExplain = (text: string): boolean => /^\s*explain\s*[.!?]?\s*$/i.test(text);

/** The developer says "transfer to agent"; KAIN says "transfer" through the room. Anything else is no trigger. */
export function parseTransfer(text: string, who: "developer" | "kain"): TransferTrigger | null {
  if (who === "developer" && TRANSFER_PHRASE.test(text)) return { askedBy: { kind: "developer" }, mode: "summary" };
  if (who === "kain" && (KAIN_TRANSFER.test(text) || TRANSFER_PHRASE.test(text))) return { askedBy: { kind: "kain" }, mode: "summary" };
  return null;
}
// [SCOPE 159 / T015] END

// [SCOPE 159 / T015] BEGIN — Transcript source: newest file, last 500 lines, developer and assistant words only (FR-069)
export const TRANSCRIPT_LINES = 500;

export interface Spoken {
  role: "developer" | "assistant";
  text: string;
}

/** Words from one transcript line, or null for tool calls and output, sub-agent and system entries. */
export function spokenFromLine(line: string): Spoken | null {
  let j: { type?: string; isSidechain?: boolean; message?: { content?: unknown } };
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j.isSidechain) return null;
  if (j.type !== "user" && j.type !== "assistant") return null;
  const c = j.message?.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    text = c
      .filter((p): p is { type: "text"; text: string } => !!p && (p as { type?: string }).type === "text" && typeof (p as { text?: unknown }).text === "string")
      .map((p) => p.text)
      .join("\n");
  }
  text = text.trim();
  if (!text) return null;
  return { role: j.type === "user" ? "developer" : "assistant", text };
}

/** The last 500 lines, kept only when they carry developer or assistant words. */
export function spokenWords(raw: string, lines = TRANSCRIPT_LINES): Spoken[] {
  const tail = raw.split("\n").filter((l) => l.trim() !== "").slice(-lines);
  return tail.map(spokenFromLine).filter((s): s is Spoken => s !== null);
}

/** This project's newest Claude Code transcript (a .jsonl in dir), or undefined. Read only. */
export function newestTranscript(dir: string): string | undefined {
  let best: { f: string; t: number } | undefined;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const f = join(dir, name);
      const t = statSync(f).mtimeMs;
      if (!best || t > best.t) best = { f, t };
    }
  } catch {
    return undefined;
  }
  return best?.f;
}

/** Only a transfer reads the transcript. */
export function readTranscriptForTransfer(dir: string): Spoken[] {
  const f = newestTranscript(dir);
  return f ? spokenWords(readFileSync(f, "utf8")) : [];
}
// [SCOPE 159 / T015] END

// [SCOPE 159 / T015] BEGIN — Masked or nothing; pieces (FR-070, FR-071)
export const PIECE_MAX = 2000;
export type Masker = (text: string) => { text: string; masked: number };

export type MaskResult = { ok: true; text: string; masked: number } | { ok: false; reason: "masker_missing" };

/** Nothing leaves without the masker; with it missing the refusal is the result and the caller logs it. */
export function maskOrRefuse(text: string, masker: Masker | undefined): MaskResult {
  if (typeof masker !== "function") return { ok: false, reason: "masker_missing" };
  const r = masker(text);
  return { ok: true, text: r.text, masked: r.masked };
}

/** Split masked text into pieces of at most PIECE_MAX characters, cutting at line breaks where it can. */
export function toPieces(text: string, max = PIECE_MAX): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = (): void => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const line of text.split("\n")) {
    let l = line;
    while (l.length > max) {
      flush();
      out.push(l.slice(0, max));
      l = l.slice(max);
    }
    if (cur.length + l.length + (cur ? 1 : 0) > max) flush();
    cur = cur ? `${cur}\n${l}` : l;
  }
  flush();
  return out;
}

export interface Piece {
  n: number;
  of: number;
  label: string;
  body: string;
}

export function numberPieces(pieces: readonly string[]): Piece[] {
  return pieces.map((body, i) => ({ n: i + 1, of: pieces.length, label: `piece ${i + 1} of ${pieces.length}`, body }));
}

/** Re-ask one piece: the same piece as the original, or undefined for an unknown number. */
export function pieceOf(pieces: readonly Piece[], n: number): Piece | undefined {
  return pieces.find((p) => p.n === n);
}

/** Masked lines for "explain": every spoken line, masked, in numbered pieces. */
export function explainPieces(spoken: readonly Spoken[], masker: Masker | undefined): { ok: true; pieces: Piece[] } | { ok: false; reason: "masker_missing" } {
  const joined = spoken.map((s) => `${s.role}: ${s.text}`).join("\n");
  const m = maskOrRefuse(joined, masker);
  if (!m.ok) return m;
  return { ok: true, pieces: numberPieces(toPieces(m.text)) };
}
// [SCOPE 159 / T015] END

// [SCOPE 159 / T015] BEGIN — Transfer guards (FR-072)
export interface TransferGuards {
  /** SCOPE-132 FR-080 status sharing for this project. */
  statusSharingOn: boolean;
  /** companies.agenttransferenabled for the project's company. */
  transferSwitchOn: boolean;
  /** The company the project and the asking KAIN belong to. */
  projectCompanyId: string;
  askingCompanyId: string;
}

export type GuardResult = { ok: true } | { ok: false; reason: "status_sharing_off" | "switch_off" | "company_wall"; post: string };

/** The reason is posted: a refusal names the one thing to turn on. */
export function checkTransferGuards(g: TransferGuards): GuardResult {
  if (g.projectCompanyId !== g.askingCompanyId) return { ok: false, reason: "company_wall", post: "Transfer refused: it never crosses the company wall." };
  if (!g.statusSharingOn) return { ok: false, reason: "status_sharing_off", post: "Transfer refused: status sharing is off for this project." };
  if (!g.transferSwitchOn) return { ok: false, reason: "switch_off", post: "Transfer refused: the company ADMIN transfer switch is off." };
  return { ok: true };
}

export interface TransferLogLine {
  event: "transfer" | "refused";
  askedBy: TransferAsker["kind"];
  mode: TransferTrigger["mode"];
  reason?: string;
  masked?: number;
}

export function transferLogLine(t: TransferTrigger, outcome: { ok: true; masked: number } | { ok: false; reason: string }): TransferLogLine {
  return outcome.ok
    ? { event: "transfer", askedBy: t.askedBy.kind, mode: t.mode, masked: outcome.masked }
    : { event: "refused", askedBy: t.askedBy.kind, mode: t.mode, reason: outcome.reason };
}
// [SCOPE 159 / T015] END
