/**
 * Spec 025 — T005 Shared Business Analyst persona prompt module.
 *
 * Per C6: this module is the SINGLE source of truth for the BA persona used by
 * BOTH the in-app /api/overview/draft/:id/ai-message route (FR-004) AND the
 * orchestrator /buildscope command handler. Any divergence between consumers is
 * a defect (Success Criterion #7).
 *
 * Fixed template sections (FR-003): Problem, Overview, Goals, Primary Users,
 * Constraints, Success Criteria, Notes. Problem-first ordering mirrors
 * /buildscope — we nail the problem before describing what to build.
 */

export const OVERVIEW_TEMPLATE_SECTIONS = [
  'Problem',
  'Overview',
  'Goals',
  'Primary Users',
  'Constraints',
  'Success Criteria',
  'Notes',
] as const;

export type OverviewSection = (typeof OVERVIEW_TEMPLATE_SECTIONS)[number];

export const BUSINESS_ANALYST_SYSTEM_PROMPT = `You are a Senior Business Analyst with 15+ years helping product teams turn rough ideas into clear, implementation-ready Project Overview documents.

We start from the PROBLEM, not the solution. Before we describe what to build, we get crystal clear on the problem it solves — everything else in the overview is built from that problem. Do not let the author jump straight to features; anchor them on the problem first.

You walk the author through seven fixed template sections in order:
1. Problem — the problem we're solving: who has it, what it costs them today, and why it needs solving now. This is the foundation; do not move past it until the problem is concrete and specific.
2. Overview — what we're building and how it solves the problem above (the solution shape)
3. Goals — measurable outcomes the project should achieve
4. Primary Users — who uses this and what is their context / sophistication
5. Constraints — technical, business, or time constraints that bound the design
6. Success Criteria — how we will know this succeeded (with metrics where possible)
7. Notes — anything else that would surprise a developer or user

For each section, your job is:
- Ask 1-2 probing questions to elicit specifics. Do NOT pile on five questions at once.
- After the author answers, propose a concise Markdown draft for that section (2-6 sentences, or bullets where appropriate).
- Wait for the author to approve, change, or add before advancing to the next section.

Conversation conventions used by the author:
- "[A]pprove" or "approve" — the proposed section is good; advance to next section.
- "[C]hange ..." — the author wants a revision; revise based on their note.
- "[E]xplain ..." — clarify your reasoning for a specific choice.
- "[Add] ..." — add the author's note to the proposal.

Tone: warm, direct, fact-oriented. Challenge assumptions when they sound thin. Avoid filler.

When you propose a draft for a section, format it like this exactly so the application can detect it:

\`\`\`section:<section-key>
<Markdown content for the section>
\`\`\`

Use these section keys (lowercase, no spaces):
- problem
- overview
- goals
- primary-users
- constraints
- success-criteria
- notes

When the author approves a section and you advance to the next, briefly acknowledge the approval in plain text (1 sentence) and ask the FIRST probing question for the next section.

When all seven sections have been approved, congratulate the author and tell them they can now Submit the proposal or Create the project from the toolbar.`;

/**
 * Build the initial assistant turn for a fresh interview.
 * Used when starting an interview with no prior transcript.
 */
export function buildInterviewKickoff(opts: {
  proposalTitle?: string | null;
  existingContent?: string;
}): string {
  const { proposalTitle, existingContent } = opts;
  const lines: string[] = [];
  lines.push(`Hi — I'm your BA partner for this overview.`);
  if (proposalTitle && proposalTitle.trim()) {
    lines.push(`Working title: **${proposalTitle.trim()}**.`);
  }
  if (existingContent && existingContent.trim()) {
    lines.push(
      `I see you've already started — I'll work with what you've written and we'll fill in the gaps together.`,
    );
  }
  lines.push('');
  lines.push(
    `Let's start with **Section 1: Problem** — we build everything else from this. What problem are we solving? Who has this problem, what does it cost them today, and why does it need solving now?`,
  );
  return lines.join('\n');
}

/**
 * Detect a section proposal in an assistant message.
 * Matches the fenced code block format defined in BUSINESS_ANALYST_SYSTEM_PROMPT.
 */
export interface DetectedSectionProposal {
  sectionKey: string;
  content: string;
}

const KNOWN_SECTION_KEYS = new Set([
  'problem',
  'overview',
  'goals',
  'primary-users',
  'constraints',
  'success-criteria',
  'notes',
]);

// Accept both the canonical ```section:KEY and the looser ```KEY that some
// models (e.g., Llama 3.3) produce when ignoring the prefix in the system
// prompt. Reject normal language fences like ```js / ```python by checking
// against the known-section-key set.
const SECTION_FENCE_RE = /```(?:section:)?([a-z][a-z0-9-]*)\n([\s\S]*?)\n```/gi;

export function detectSectionProposals(
  assistantText: string,
): DetectedSectionProposal[] {
  const out: DetectedSectionProposal[] = [];
  SECTION_FENCE_RE.lastIndex = 0;
  for (const match of assistantText.matchAll(SECTION_FENCE_RE)) {
    const candidate = (match[1] || '').toLowerCase();
    if (!KNOWN_SECTION_KEYS.has(candidate)) continue;
    out.push({ sectionKey: candidate, content: (match[2] || '').trim() });
  }
  return out;
}

/**
 * Map section-key (kebab) to the heading text used in the editor's markdown.
 */
export const SECTION_KEY_TO_HEADING: Record<string, string> = {
  problem: 'Problem',
  overview: 'Overview',
  goals: 'Goals',
  'primary-users': 'Primary Users',
  constraints: 'Constraints',
  'success-criteria': 'Success Criteria',
  notes: 'Notes',
};

// [SCOPE 025 / FR-021] BEGIN — Interview continuity: durable section-state derivation + preamble
/**
 * Section keys in canonical template order (mirrors OVERVIEW_TEMPLATE_SECTIONS).
 * The interview walks these in order; "current" is the first not-yet-covered key.
 */
export const OVERVIEW_SECTION_KEYS = [
  'problem',
  'overview',
  'goals',
  'primary-users',
  'constraints',
  'success-criteria',
  'notes',
] as const;

/**
 * FR-021 (1)/(3) — Derive which template sections already have real content in
 * the draft markdown. A section counts as covered when there is any
 * non-whitespace text under its `## Heading` before the next `## ` heading.
 * The empty seed template (`## Heading\n\n`) yields an empty body → not covered.
 *
 * This is a DURABLE signal (reads the persisted draft body), independent of the
 * bounded transcript window (FR-020) — so the interview never loses its place
 * as early turns scroll out of the window.
 */
export function sectionsWithContent(content: string): Set<string> {
  const covered = new Set<string>();
  if (!content) return covered;
  for (const key of OVERVIEW_SECTION_KEYS) {
    const heading = SECTION_KEY_TO_HEADING[key];
    if (!heading) continue;
    const headingRe = new RegExp(`(^|\\n)## ${heading}\\b[^\\n]*\\n`, 'i');
    const m = content.match(headingRe);
    if (!m) continue;
    const startIdx = content.indexOf(m[0]) + m[0].length;
    const tail = content.slice(startIdx);
    const nextRel = tail.search(/\n## /);
    const body = nextRel === -1 ? tail : tail.slice(0, nextRel);
    if (body.trim().length > 0) covered.add(key);
  }
  return covered;
}

/**
 * FR-021 (1) — Build the window-independent interview-state preamble that is
 * appended to the BA system prompt on every turn. It tells the model, in
 * template order, which sections are already covered (do not revisit) and which
 * section is current, so a slid transcript window can never disorient it into
 * restarting at Problem.
 *
 * `coveredKeys` should be the union of {sections with draft content} and
 * {sections an assistant already proposed via a `section:` fence} — see the
 * ai-message route.
 */
export function buildInterviewStatePreamble(coveredKeys: Set<string>): string {
  const covered = OVERVIEW_SECTION_KEYS.filter((k) => coveredKeys.has(k));
  const remaining = OVERVIEW_SECTION_KEYS.filter((k) => !coveredKeys.has(k));
  const current = remaining[0] ?? null;
  const label = (k: string): string => SECTION_KEY_TO_HEADING[k] ?? k;

  const lines: string[] = [];
  lines.push(
    'INTERVIEW STATE (authoritative — trust this over the conversation history, which may be truncated):',
  );
  lines.push(
    covered.length
      ? `- Sections already covered (drafted/approved — do NOT revisit unless the author explicitly asks): ${covered
          .map(label)
          .join(', ')}.`
      : '- Sections already covered: none yet.',
  );
  if (current) {
    lines.push(`- Current section to work on now: ${label(current)}.`);
    const after = remaining.slice(1);
    if (after.length) {
      lines.push(`- Sections remaining after the current one: ${after.map(label).join(', ')}.`);
    }
    lines.push(
      `Ask your probing question(s) for ${label(current)} next. Do NOT restart from Problem or re-open a covered section.`,
    );
  } else {
    lines.push(
      '- All seven sections are covered. Congratulate the author and tell them they can now Submit the proposal or Create the project from the toolbar. Do NOT restart from Problem.',
    );
  }
  return lines.join('\n');
}
// [SCOPE 025 / FR-021] END
