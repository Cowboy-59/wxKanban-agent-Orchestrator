// [SCOPE 148 / T014] BEGIN — the room summary, with no customer text (SPEC-148 FR-008)
//
// One post per run, rendered by the BRIDGE from the report's `triage-summary` JSON block.
//
// The reason this is rendered here and not written by the agent is the threat model. Every
// title, body and attachment the triage session read was written by a customer, and one of
// those customers may have filed a report whose TITLE is an injection string aimed at whoever
// reads the summary. The agent is instructed to write its own 8-word label, but an instructed
// agent is a soft guarantee; a renderer that only ever emits numbers, enum values, UUIDs and
// labels that passed a filter is a hard one.
//
// So the room gets, by construction:
//
//   counts        integers, keyed by the six known statuses
//   severity      integers, keyed by S1..S4
//   top groups    a severity enum, an integer, a UUID group key, and a FILTERED label
//   changes       an integer
//   report path   a path the bridge chose itself
//
// Nothing else. A label that fails the filter is replaced by the group key — less readable,
// never dangerous. That is the right way round: the summary is a signal to go read the report,
// not a substitute for it.

/** FR-008: the most groups a summary lists. */
export const TOP_GROUPS = 5;

/** FR-008: an agent label may be this many words, at most. */
export const MAX_LABEL_WORDS = 8;

/** A label longer than this is treated as prose, whatever its word count. */
export const MAX_LABEL_CHARS = 80;

const STATUSES = ["new", "triaged", "needsinfo", "inprogress", "resolved", "declined"] as const;
const SEVERITIES = ["S1", "S2", "S3", "S4"] as const;

export interface TopGroup {
  severity: string;
  members: number;
  key: string;
  label: string;
}

export interface TriageSummary {
  counts: Record<string, number>;
  severity: Record<string, number>;
  top: TopGroup[];
  changes: number;
}

/** Lowercased, punctuation-stripped, whitespace-collapsed — for comparing a label to a title. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/**
 * The label to post for a group, or the group key when the label cannot be trusted.
 *
 * Rejected: a non-string or empty label; more than 8 words; longer than 80 characters; anything
 * carrying structure rather than words (newline, backtick, URL, markdown link, angle bracket);
 * and a label that copies a customer title.
 *
 * The title test is normalized equality, plus substring containment for labels of 4 words or
 * more. Substring is NOT applied to short labels on purpose: "login fails" is a fair label and
 * also a fragment of plenty of titles, and replacing every such label with a UUID would make
 * the summary unreadable and push people back to opening the report every time — which is the
 * behaviour this post exists to avoid. Four words is long enough that an accidental collision
 * is unlikely and a deliberate copy is likely.
 */
export function safeLabel(label: unknown, key: string, titles: readonly string[] = []): string {
  if (typeof label !== "string") return key;
  const raw = label.trim();
  if (raw === "") return key;
  if (raw.length > MAX_LABEL_CHARS) return key;
  if (wordCount(raw) > MAX_LABEL_WORDS) return key;
  // Structure, not words: a label has no business containing any of these.
  if (/[\r\n`<>|]/.test(raw)) return key;
  if (/\bhttps?:\/\//i.test(raw) || /\]\(/.test(raw)) return key;

  const n = normalize(raw);
  if (n === "") return key;
  for (const t of titles) {
    const nt = normalize(t);
    if (nt === "") continue;
    if (nt === n) return key;
    if (wordCount(n) >= 4 && nt.includes(n)) return key;
  }
  return raw;
}

/** Non-negative integers only; anything else reads as 0 rather than reaching the room. */
function int(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Parse the agent's block into the shape this renderer will emit. Unknown keys are dropped. */
export function readSummary(raw: unknown): TriageSummary | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const counts: Record<string, number> = {};
  const sev: Record<string, number> = {};
  const c = (o.counts ?? {}) as Record<string, unknown>;
  const s = (o.severity ?? {}) as Record<string, unknown>;
  for (const k of STATUSES) counts[k] = int(c[k]);
  for (const k of SEVERITIES) sev[k] = int(s[k]);

  const top: TopGroup[] = [];
  if (Array.isArray(o.top)) {
    for (const g of o.top.slice(0, TOP_GROUPS)) {
      if (g === null || typeof g !== "object") continue;
      const gg = g as Record<string, unknown>;
      const severity = SEVERITIES.find((x) => x === gg.severity) ?? "S4";
      const key = typeof gg.key === "string" && gg.key.trim() !== "" ? gg.key.trim() : "(no key)";
      top.push({ severity, members: int(gg.members), key, label: typeof gg.label === "string" ? gg.label : "" });
    }
  }
  return { counts, severity: sev, top, changes: int(o.changes) };
}

export interface RoomSummaryInput {
  summary: unknown;
  reportPath: string;
  trigger: string;
  /** Customer titles, compared against so a copied one is replaced. Never rendered. */
  titles?: readonly string[];
  /** The hook's block count for this run, when there was one. */
  blocks?: number;
}

/**
 * The post. Returns a plain-text block; the caller posts it verbatim.
 *
 * A missing or unreadable summary block is reported as exactly that, with the report path, so
 * the operator still learns a report exists — it is never silently dropped.
 */
export function buildRoomSummary(input: RoomSummaryInput): string {
  const s = readSummary(input.summary);
  if (!s) {
    return [
      `Feedback triage (${input.trigger}) finished, but its summary block could not be read.`,
      `Report: ${input.reportPath}`,
    ].join("\n");
  }

  const total = STATUSES.reduce((n, k) => n + s.counts[k], 0);
  const countLine = STATUSES.filter((k) => s.counts[k] > 0)
    .map((k) => `${k} ${s.counts[k]}`)
    .join(" · ");
  const sevLine = SEVERITIES.filter((k) => s.severity[k] > 0)
    .map((k) => `${k} ${s.severity[k]}`)
    .join(" · ");

  const lines: string[] = [
    `Feedback triage (${input.trigger}) — ${total} report${total === 1 ? "" : "s"}, ${s.changes} change${s.changes === 1 ? "" : "s"}`,
    `Status:   ${countLine || "none"}`,
    `Severity: ${sevLine || "none"}`,
  ];

  if (s.top.length > 0) {
    lines.push("", `Top ${s.top.length} group${s.top.length === 1 ? "" : "s"}:`);
    for (const g of s.top) {
      const label = safeLabel(g.label, g.key, input.titles ?? []);
      lines.push(`  ${g.severity} · ${g.members} report${g.members === 1 ? "" : "s"} · ${label} [${g.key}]`);
    }
  }

  if (input.blocks !== undefined && input.blocks > 0) {
    lines.push("", `Hook blocks: ${input.blocks}`);
  }
  lines.push("", `Report: ${input.reportPath}`);
  return lines.join("\n");
}
// [SCOPE 148 / T014] END
