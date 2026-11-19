import { eq, and } from 'drizzle-orm';
import { db, pool } from '~/db/client.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { generateOnce } from '~/server/ai/llm-provider.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('scope-process-flow');

export const SCOPE_PROCESS_FLOW_DOCTYPE = 'ScopeProcessFlow';

// Section markers so Part 1 (tasks) and Part 2 (AI) can be regenerated independently
// while preserving the other half.
const TASK_START = '<!-- TASKFLOW:START -->';
const TASK_END = '<!-- TASKFLOW:END -->';
const AI_START = '<!-- AIFLOW:START -->';
const AI_END = '<!-- AIFLOW:END -->';

function section(name: 'TASK' | 'AI', inner: string): string {
  const [s, e] = name === 'TASK' ? [TASK_START, TASK_END] : [AI_START, AI_END];
  return `${s}\n${inner}\n${e}`;
}

function extractSection(content: string, name: 'TASK' | 'AI'): string | null {
  const [s, e] = name === 'TASK' ? [TASK_START, TASK_END] : [AI_START, AI_END];
  const i = content.indexOf(s);
  const j = content.indexOf(e);
  if (i === -1 || j === -1 || j < i) return null;
  return content.slice(i + s.length, j).trim();
}

// [SCOPE 059 / T001] BEGIN — Per-scope Process Flow generator (task flow + AI flow)
export class ScopeProcessFlowGenerator {
  /** Part 1: deterministic flowchart from a spec's tasks + their dependency edges. */
  static async buildTaskFlowSection(specid: string): Promise<string> {
    const tasks = await pool.query<{ id: string; name: string; status: string }>(
      `select id, name, status from projecttasks where specid = $1 order by createdat`,
      [specid],
    );
    if (!tasks.rows.length) {
      return section('TASK', '## Task & dependency flow\n\n_No tasks exist for this scope yet._');
    }
    const ids = tasks.rows.map((t: { id: string; name: string; status: string }) => t.id);
    const deps = await pool.query<{ taskid: string; blockedbyid: string }>(
      `select taskid, blockedbyid from taskdependencies
       where taskid = any($1::uuid[]) and blockedbyid = any($1::uuid[])`,
      [ids],
    );

    // Map each task to a short, mermaid-safe node id (uuids contain hyphens).
    const nodeId = new Map<string, string>();
    tasks.rows.forEach((t: { id: string; name: string; status: string }, i: number) =>
      nodeId.set(t.id, `T${i}`));
    // Strip characters that break Mermaid node labels (quotes, brackets, pipes, angle
    // brackets, newlines); keep it on one line — no <br/> (it gets HTML-parsed and corrupts
    // the diagram source when injected into the DOM).
    const esc = (s: string) =>
      (s || '').replace(/["[\]{}|<>\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

    const lines = ['## Task & dependency flow', '', '```mermaid', 'flowchart TD'];
    for (const t of tasks.rows) {
      lines.push(`  ${nodeId.get(t.id)}["${esc(t.name)} (${esc(t.status)})"]`);
    }
    if (deps.rows.length) {
      for (const d of deps.rows) {
        const from = nodeId.get(d.blockedbyid);
        const to = nodeId.get(d.taskid);
        if (from && to) lines.push(`  ${from} --> ${to}`);
      }
    } else {
      lines.push('  %% No dependencies recorded — tasks are independent.');
    }
    lines.push('```');
    return section('TASK', lines.join('\n'));
  }

  /** Part 2: AI-derived process flow from the spec narrative. Server-side LLM. */
  static async buildAiFlowSection(specTitle: string, specContent: string): Promise<string> {
    const placeholder =
      '## Process flow (AI-derived)\n\n_Not generated yet — use **Refresh AI flow** to build it from the spec text._';
    const content = (specContent || '').slice(0, 6000);
    if (!content.trim()) return section('AI', placeholder);

    const systemPrompt =
      'You convert a software feature specification into a process flowchart. ' +
      'Output ONLY a Mermaid flowchart inside a ```mermaid code fence — no prose, no explanation. ' +
      'Use `flowchart TD`. Show the main steps in order, decision points as diamonds, and the ' +
      'actors/systems involved. Keep it to at most ~20 nodes. Use short node labels.';
    const prompt = `Specification: ${specTitle}\n\n${content}`;

    let raw: string;
    try {
      raw = await generateOnce(prompt, { systemPrompt, temperature: 0.3, maxTokens: 1200 });
    } catch (e) {
      logger.warn({ specTitle, err: (e as Error).message }, 'AI flow generation failed');
      return section('AI', placeholder);
    }

    const mermaid = this.extractMermaid(raw);
    if (!mermaid) {
      logger.warn({ specTitle }, 'AI flow output was not valid mermaid; keeping placeholder');
      return section('AI', placeholder);
    }
    return section('AI', `## Process flow (AI-derived)\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``);
  }

  /** Pull a mermaid flowchart out of an LLM response and sanity-check it. */
  static extractMermaid(raw: string): string | null {
    let text = raw.trim();
    const fence = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    // Must look like a flowchart and have at least one edge or node.
    if (!/^(flowchart|graph)\s/i.test(text)) return null;
    if (text.length < 20) return null;
    return text;
  }

  /**
   * Generate/refresh the per-scope process-flow document. `parts` selects which halves to
   * (re)build; the other half is preserved from the existing doc (or seeded once).
   */
  static async generate(
    specid: string,
    parts: { tasks?: boolean; ai?: boolean },
    createdbyid?: string | null,
  ): Promise<{ id: string; projectid: string } | null> {
    const [spec] = await db
      .select({
        id: projectspecifications.id,
        projectid: projectspecifications.projectid,
        title: projectspecifications.title,
        content: projectspecifications.content,
      })
      .from(projectspecifications)
      .where(eq(projectspecifications.id, specid))
      .limit(1);
    if (!spec) return null;

    const existing = await this.getStored(spec.projectid, specid);
    const existingContent = existing?.content ?? '';

    // Task section: rebuild if requested or missing.
    const haveTask = extractSection(existingContent, 'TASK');
    const taskSection =
      parts.tasks || !haveTask ? await this.buildTaskFlowSection(specid) : section('TASK', haveTask);

    // AI section: rebuild only if explicitly requested; otherwise preserve / seed placeholder.
    const haveAi = extractSection(existingContent, 'AI');
    const aiSection = parts.ai
      ? await this.buildAiFlowSection(spec.title, spec.content ?? '')
      : haveAi
        ? section('AI', haveAi)
        : section('AI', '## Process flow (AI-derived)\n\n_Not generated yet — use **Refresh AI flow** to build it._');

    const doc = [`# Process Flow — ${spec.title}`, '', taskSection, '', aiSection, ''].join('\n');
    const id = await this.upsert(spec.projectid, specid, spec.title, doc, createdbyid ?? null);
    logger.info({ specid, projectid: spec.projectid, parts }, 'Scope process flow generated');
    return { id, projectid: spec.projectid };
  }

  /** Upsert the ScopeProcessFlow doc keyed by (projectid, specid, doctype). */
  static async upsert(
    projectid: string,
    specid: string,
    title: string,
    content: string,
    createdbyid: string | null,
  ): Promise<string> {
    const now = new Date();
    const [found] = await db
      .select({ id: projectdocuments.id })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.specid, specid),
          eq(projectdocuments.doctype, SCOPE_PROCESS_FLOW_DOCTYPE),
        ),
      )
      .limit(1);
    if (found) {
      await db
        .update(projectdocuments)
        .set({ title: `Process Flow — ${title}`, content, isgenerated: true, updatedat: now })
        .where(eq(projectdocuments.id, found.id));
      return found.id;
    }
    const [inserted] = await db
      .insert(projectdocuments)
      .values({
        projectid,
        specid,
        doctype: SCOPE_PROCESS_FLOW_DOCTYPE,
        title: `Process Flow — ${title}`,
        content,
        isgenerated: true,
        createdbyid,
        createdat: now,
        updatedat: now,
      })
      .returning({ id: projectdocuments.id });
    return inserted.id;
  }

  /**
   * Render the current process flow WITHOUT persisting: the task-dependency flow is rebuilt
   * live (so it always reflects current tasks — no mutation hooks needed), and the AI flow is
   * taken from the stored doc if it exists, else a placeholder. Returns null if spec missing.
   */
  static async renderCurrent(specid: string): Promise<string | null> {
    const [spec] = await db
      .select({
        id: projectspecifications.id,
        projectid: projectspecifications.projectid,
        title: projectspecifications.title,
      })
      .from(projectspecifications)
      .where(eq(projectspecifications.id, specid))
      .limit(1);
    if (!spec) return null;

    const taskSection = await this.buildTaskFlowSection(specid);
    const existing = await this.getStored(spec.projectid, specid);
    const aiInner = existing ? extractSection(existing.content, 'AI') : null;
    const aiSection = aiInner
      ? section('AI', aiInner)
      : section('AI', '## Process flow (AI-derived)\n\n_Not generated yet — use **Refresh AI flow** to build it from the spec text._');

    return [`# Process Flow — ${spec.title}`, '', taskSection, '', aiSection, ''].join('\n');
  }

  /** Fetch the stored process-flow doc for a scope (for the viewer). */
  static async getStored(
    projectid: string,
    specid: string,
  ): Promise<{ content: string; updatedat: Date | null } | null> {
    const [row] = await db
      .select({ content: projectdocuments.content, updatedat: projectdocuments.updatedat })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.specid, specid),
          eq(projectdocuments.doctype, SCOPE_PROCESS_FLOW_DOCTYPE),
        ),
      )
      .limit(1);
    return row ? { content: row.content, updatedat: row.updatedat ?? null } : null;
  }

  /** Spec-level doc-status: which specs of a project have a process-flow doc (+ timestamp). */
  static async statusForProject(projectid: string): Promise<Record<string, string | null>> {
    const rows = await db
      .select({ specid: projectdocuments.specid, updatedat: projectdocuments.updatedat })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.doctype, SCOPE_PROCESS_FLOW_DOCTYPE),
        ),
      );
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      if (r.specid) out[r.specid] = r.updatedat ? r.updatedat.toISOString() : null;
    }
    return out;
  }
}
// [SCOPE 059 / T001] END
