/**
 * Spec 025 FR-013 / FR-014 — section-mapping prompt for paste & import flows.
 *
 * Where the BA persona (business-analyst.ts) walks the author through an
 * interview, this prompt takes a block of existing content (pasted text or an
 * imported document) and maps it onto the fixed template sections in one
 * pass, emitting the same ```section:<key> fenced format the client already
 * detects (see detectSectionProposals / InterviewChatPanel) so the review +
 * approve UI is shared across all three entry modes.
 */
import { OVERVIEW_TEMPLATE_SECTIONS } from './business-analyst.js';

export const SECTION_MAPPER_SYSTEM_PROMPT = `You are a Senior Business Analyst. The author has given you existing material (notes, an email, a document, or a web page) and wants it organized into a Project Overview document with seven fixed sections:

1. Problem — the problem we're solving: who has it, what it costs them today, and why it needs solving now
2. Overview — what we're building and how it solves the problem above (the solution shape)
3. Goals — measurable outcomes the project should achieve
4. Primary Users — who uses this and their context / sophistication
5. Constraints — technical, business, or time constraints that bound the design
6. Success Criteria — how we'll know this succeeded (metrics where possible)
7. Notes — anything else that would surprise a developer or user

Your job:
- Read the supplied material and extract the relevant content for each section.
- Reformat into clean, concise Markdown (short paragraphs or bullets).
- Do NOT invent facts that are not supported by the material. If a section has no
  supporting content, emit the section with a single line: "_No source content found for this section._"
- Cover the sections in the order above.

Emit EACH section as a fenced block in EXACTLY this format so the application can detect it:

\`\`\`section:<section-key>
<Markdown content for the section>
\`\`\`

Use these section keys (lowercase): problem, overview, goals, primary-users, constraints, success-criteria, notes.

After the seven fenced blocks, add one short plain-text line telling the author they can review each proposed section and Approve, Change, Explain, or Add to it.`;

/**
 * Build the user-turn content for a single mapping pass. For chunked imports,
 * `priorMapping` carries the section mapping produced so far so the model can
 * refine rather than restart (accumulating-context mode, N9).
 */
export function buildSectionMappingTurn(opts: {
  sourceText: string;
  chunkIndex?: number;
  chunkTotal?: number;
  priorMapping?: string;
}): string {
  const { sourceText, chunkIndex, chunkTotal, priorMapping } = opts;
  const parts: string[] = [];
  if (chunkTotal && chunkTotal > 1) {
    parts.push(
      `This is part ${(chunkIndex ?? 0) + 1} of ${chunkTotal} of a larger document.`,
    );
    if (priorMapping && priorMapping.trim()) {
      parts.push(
        'Here is the section mapping produced from the earlier parts. Merge new information from this part into it, keeping prior content unless this part clearly supersedes it. Re-emit the full set of fenced sections.',
      );
      parts.push('--- MAPPING SO FAR ---');
      parts.push(priorMapping.trim());
    }
    parts.push('--- DOCUMENT PART ---');
  } else {
    parts.push(
      `Map the following material into the ${OVERVIEW_TEMPLATE_SECTIONS.length} sections (${OVERVIEW_TEMPLATE_SECTIONS.join(', ')}).`,
    );
    parts.push('--- MATERIAL ---');
  }
  parts.push(sourceText);
  return parts.join('\n\n');
}
