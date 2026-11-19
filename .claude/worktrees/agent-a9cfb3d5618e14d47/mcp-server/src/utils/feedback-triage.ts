// [SCOPE 043 / T005] BEGIN — background AI triage for User Feedback
// MODIFIED-BY: [SCOPE 043 / T013] — AI also proposes a disposition (FR-011)
// MODIFIED-BY: [SCOPE 043 / T028] — Amendment E: attachments excerpted, not inlined (FR-026)
// Server-side assistant (LLM_PROVIDER, default groq + openai/gpt-oss-120b)
// that runs over a new feedbacksubmissions row and writes back: classification
// (bug|suggestion), severity, a dedup link (duplicateofid) against existing
// items, and a DRAFT clarifying question for the admin. It does NOT change
// status — the admin sends the clarification (T006) and the submitter only sees
// the question once status flips to needsinfo (T007). Fired fire-and-forget from
// submit (the MCP server is a persistent process), best-effort and idempotent;
// a missing GROQ_API_KEY makes it a logged no-op so the channel still works.
import { and, eq, ne } from 'drizzle-orm';
import type { ScopedDb } from '../db/scoped-query.js';
import { feedbacksubmissions, type FeedbackSubmission } from '../db/schema.js';
import { renderAndUpsertFeedbackArtifact } from './feedback-artifact.js';
import { renderForTriage, splitDetails } from './feedback-attachments.js'; // [SCOPE 043 / T028]
import { logger } from './logger.js';

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const CLASSIFICATIONS = ['bug', 'suggestion'] as const;
// [SCOPE 043 / T013] disposition vocabulary (mirrors FEEDBACK_DISPOSITIONS).
const DISPOSITIONS = ['scope', 'outofbandfix', 'duplicate', 'decline', 'needsinfo'] as const;

export interface TriageResult {
  classification: (typeof CLASSIFICATIONS)[number];
  severity: (typeof SEVERITIES)[number];
  duplicateOf: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  // [SCOPE 043 / T013] proposed disposition + one-line rationale (FR-011).
  disposition: (typeof DISPOSITIONS)[number];
  dispositionRationale: string | null;
}

export interface TriageCandidate {
  id: string;
  type: string;
  title: string;
}

export function buildTriagePrompt(
  row: FeedbackSubmission,
  candidates: TriageCandidate[],
): { system: string; user: string } {
  const system = [
    'You triage user feedback (bug reports and feature suggestions) for a software product.',
    'Return ONLY a JSON object, no prose, with exactly these keys:',
    '{ "classification": "bug" | "suggestion",',
    '  "severity": "low" | "medium" | "high" | "critical",',
    '  "duplicateOf": <id-string from the candidate list, or null>,',
    '  "needsClarification": <boolean>,',
    '  "clarificationQuestion": <a single specific question for the submitter, or null>,',
    '  "disposition": "scope" | "outofbandfix" | "duplicate" | "decline" | "needsinfo",',
    '  "dispositionRationale": <one short sentence justifying the disposition> }',
    'Rules: pick duplicateOf ONLY if the new report is clearly the same issue as a candidate (else null).',
    'Set needsClarification=true only when the report is too vague to act on; then give one concrete question.',
    'Judge severity from user-felt impact (data loss/blocking = high/critical; cosmetic = low).',
    'disposition = what should happen to this item:',
    '  "scope" = warrants a new spec/scope of development work;',
    '  "outofbandfix" = a real defect but a small fix, not worth its own scope (e.g. config/install/env);',
    '  "duplicate" = same as an existing candidate (set duplicateOf too);',
    '  "decline" = out of scope, not actionable, or won\'t do;',
    '  "needsinfo" = too vague to decide (also set needsClarification=true).',
    'Default suggestions worth building to "scope"; default trivial/cosmetic bugs to "outofbandfix".',
  ].join('\n');

  // [SCOPE 043 / T028] Amendment E (FR-026): attachments are excerpted, never
  // stringified into the prompt. Before this split, `JSON.stringify(row.details)`
  // would have put an entire log — up to 128 KB per file — into every triage
  // call, making the prompt cost of a report a function of what was attached.
  const { plain, attachments } = splitDetails(row.details);
  const details = JSON.stringify(plain, null, 2) + renderForTriage(attachments);
  const candidateList =
    candidates.length === 0
      ? '(none)'
      : candidates.map((c) => `- ${c.id} [${c.type}] ${c.title}`).join('\n');

  const user = [
    `New ${row.type} report:`,
    `Title: ${row.title}`,
    `Details:\n${details}`,
    '',
    'Existing candidate reports in this project (for duplicate detection):',
    candidateList,
  ].join('\n');

  return { system, user };
}

export function parseTriageResult(
  text: string,
  candidateIds: Set<string>,
): TriageResult | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const classification = CLASSIFICATIONS.includes(o['classification'] as never)
    ? (o['classification'] as TriageResult['classification'])
    : 'bug';
  const severity = SEVERITIES.includes(o['severity'] as never)
    ? (o['severity'] as TriageResult['severity'])
    : 'medium';
  // Trust a duplicate link only if it names a real candidate (never invented).
  const dup =
    typeof o['duplicateOf'] === 'string' && candidateIds.has(o['duplicateOf'])
      ? (o['duplicateOf'] as string)
      : null;
  const needsClarification = o['needsClarification'] === true;
  const clarificationQuestion =
    needsClarification && typeof o['clarificationQuestion'] === 'string'
      ? (o['clarificationQuestion'] as string).trim() || null
      : null;

  // [SCOPE 043 / T013] disposition: trust the model when valid, but keep it
  // consistent with the other signals (dup → duplicate, vague → needsinfo).
  let disposition: TriageResult['disposition'] = DISPOSITIONS.includes(o['disposition'] as never)
    ? (o['disposition'] as TriageResult['disposition'])
    : classification === 'suggestion'
      ? 'scope'
      : 'outofbandfix';
  if (dup) disposition = 'duplicate';
  else if (needsClarification) disposition = 'needsinfo';
  const dispositionRationale =
    typeof o['dispositionRationale'] === 'string'
      ? (o['dispositionRationale'] as string).trim() || null
      : null;

  return {
    classification,
    severity,
    duplicateOf: dup,
    needsClarification,
    clarificationQuestion,
    disposition,
    dispositionRationale,
  };
}

/** Minimal groq JSON call. Throws if LLM_PROVIDER!=groq or no key (caller treats as skip). */
async function callTriageLlm(system: string, user: string): Promise<string> {
  const provider = (process.env['LLM_PROVIDER'] || 'groq').toLowerCase();
  if (provider !== 'groq') {
    throw new Error(`feedback triage supports groq only in v1 (LLM_PROVIDER=${provider})`);
  }
  const apiKey = process.env['GROQ_API_KEY'];
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  // [SCOPE 099 / T013] Groq retired llama-3.3-70b-versatile (404 model_not_found), which
  // silently disabled triage for every report from 2026-09-10; the hosted MCP sets no GROQ_MODEL.
  const model = process.env['GROQ_MODEL'] || 'openai/gpt-oss-120b';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content;
  if (!out) throw new Error('Empty response from Groq');
  return out;
}

/**
 * Orchestrate triage for one row: gather dedup candidates, ask the LLM, apply
 * results, and re-render the artifact. Best-effort and self-contained — never
 * throws to the caller (fire-and-forget). A no-op (logged) when no LLM key.
 */
export async function triageFeedbackSubmission(
  scoped: ScopedDb,
  row: FeedbackSubmission,
): Promise<void> {
  try {
    // Dedup candidates: other submissions of the same type in this project.
    const others = (await scoped.selectScoped(
      feedbacksubmissions,
      and(eq(feedbacksubmissions.type, row.type), ne(feedbacksubmissions.id, row.id)),
    )) as FeedbackSubmission[];
    const candidates: TriageCandidate[] = others
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((c) => ({ id: c.id, type: c.type, title: c.title }));
    const candidateIds = new Set(candidates.map((c) => c.id));

    const { system, user } = buildTriagePrompt(row, candidates);

    let outText: string;
    try {
      outText = await callTriageLlm(system, user);
    } catch (err) {
      logger.warn('Feedback triage skipped (LLM unavailable)', {
        feedbackId: row.id,
        reason: (err as Error).message,
      });
      return;
    }

    const result = parseTriageResult(outText, candidateIds);
    if (!result) {
      logger.warn('Feedback triage produced unparseable output', { feedbackId: row.id });
      return;
    }

    const updated = (await scoped.updateScoped(
      feedbacksubmissions,
      {
        classification: result.classification,
        severity: result.severity,
        duplicateOfId: result.duplicateOf,
        // Draft only — admin decides whether to send it (status stays put).
        clarificationQuestion: result.clarificationQuestion ?? row.clarificationQuestion,
        // [SCOPE 043 / T013] AI proposal only — admin's final `disposition` is
        // set separately in SysAdmin (the override is retained alongside this).
        aiproposedDisposition: result.disposition,
        dispositionRationale: result.dispositionRationale,
        updatedAt: new Date(),
      },
      eq(feedbacksubmissions.id, row.id),
    )) as FeedbackSubmission[];

    logger.info('Feedback auto-triaged', {
      feedbackId: row.id,
      classification: result.classification,
      severity: result.severity,
      duplicateOf: result.duplicateOf,
      disposition: result.disposition,
      drafted: !!result.clarificationQuestion,
    });

    // Reflect the triage on the lifecycle artifact.
    const newRow = updated[0] ?? row;
    const artifact = await renderAndUpsertFeedbackArtifact(scoped, newRow);
    if (!artifact.ok) {
      logger.warn('Artifact re-render after triage failed — leg left pending', {
        feedbackId: row.id,
        error: artifact.error,
      });
    }
  } catch (err) {
    logger.warn('Feedback triage failed', {
      feedbackId: row.id,
      error: (err as Error).message,
    });
  }
}

/**
 * Await triage but never let it block the submit for more than timeoutMs.
 * Hosted note: App Runner can throttle the container's CPU once the HTTP
 * response is sent, so a post-response fire-and-forget LLM call may stall and
 * never finish. Awaiting inline (with a bound) makes triage reliable; on
 * timeout the row is simply left untriaged for manual SysAdmin triage.
 */
export async function triageWithTimeout(
  scoped: ScopedDb,
  row: FeedbackSubmission,
  timeoutMs = 4000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn('Feedback triage timed out — left for manual triage', {
        feedbackId: row.id,
        timeoutMs,
      });
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([triageFeedbackSubmission(scoped, row), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
// [SCOPE 043 / T005] END
