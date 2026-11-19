import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { createLogger } from '~/server/lib/logger.js';
import { stampMarkdown } from '@wxkanban/watermark';
import { APP_VERSION } from '~/client/version.js';

const logger = createLogger('development-plan-generator');

// App-side build-roadmap generator (SCOPE-081). Mirrors ProjectLifecycleGenerator,
// but frames the project as a foundation-up BUILD ORDER rather than a phase
// distribution. The app DB has no scope-dependency graph (that lives in
// mcp-server, surfaced in the Cockpit panel), so this renders the status-at-a-
// glance table grouped by lifecycle phase from projectspecifications only.
// Deterministic, no AI. Caller chains PDF render + DB upsert (doctype DevelopmentPlan).
const STATUS_TO_PHASE: Record<string, { order: number; label: string; progress: number }> = {
  draft: { order: 0, label: 'Scoping', progress: 0 },
  deferred: { order: 0, label: 'Scoping', progress: 0 },
  in_review: { order: 1, label: 'Design', progress: 10 },
  pending_clarification: { order: 1, label: 'Design', progress: 15 },
  clarified: { order: 1, label: 'Design', progress: 20 },
  planned: { order: 1, label: 'Design', progress: 25 },
  tasks_generated: { order: 1, label: 'Design', progress: 33 },
  implementing: { order: 2, label: 'Implementation', progress: 50 },
  implemented: { order: 2, label: 'Implementation', progress: 66 },
  qa_passed: { order: 3, label: 'QA Testing', progress: 75 },
  human_tested: { order: 4, label: 'Human Testing', progress: 85 },
  beta_cleared: { order: 5, label: 'Beta Release', progress: 95 },
  released: { order: 6, label: 'Released', progress: 100 },
};

const PHASE_ORDER: Array<{ order: number; label: string }> = [
  { order: 0, label: 'Scoping' },
  { order: 1, label: 'Design' },
  { order: 2, label: 'Implementation' },
  { order: 3, label: 'QA Testing' },
  { order: 4, label: 'Human Testing' },
  { order: 5, label: 'Beta Release' },
  { order: 6, label: 'Released' },
];

interface SpecRoadmapRow {
  specnumber: string;
  title: string;
  status: string;
  order: number;
  label: string;
  progress: number;
}

// [SCOPE 081 / T010] BEGIN — Development Plan viewer route + in-app review/print
function stateEmoji(progress: number): string {
  if (progress >= 100) return '🟢';
  if (progress > 0) return '🟡';
  return '🔴';
}
// [SCOPE 081 / T010] END

export interface DevelopmentPlanGenerationResult {
  projectid: string;
  projectName: string;
  markdown: string;
  outputPath: string;
  specCount: number;
}

// [SCOPE 081 / T010] BEGIN — Development Plan viewer route + in-app review/print
export class DevelopmentPlanGenerator {
  /**
   * Generate per-project build-roadmap markdown and write it to
   * specs/projects/<projectid>/developmentplan.md. Does NOT render PDF or
   * upsert to the DB — callers chain those steps.
   */
  static async generate(projectid: string): Promise<DevelopmentPlanGenerationResult> {
    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid))
      .limit(1);
    if (!project) {
      throw new Error(`Project not found: ${projectid}`);
    }

    const specs = await db
      .select({
        specnumber: projectspecifications.specnumber,
        title: projectspecifications.title,
        status: projectspecifications.status,
      })
      .from(projectspecifications)
      .where(eq(projectspecifications.projectid, projectid))
      .orderBy(projectspecifications.specorder);

    const rows: SpecRoadmapRow[] = specs.map((s) => {
      const m = STATUS_TO_PHASE[s.status] ?? { order: 0, label: 'Scoping', progress: 0 };
      return { specnumber: s.specnumber, title: s.title, status: s.status, order: m.order, label: m.label, progress: m.progress };
    });

    // [SCOPE 082 / T006] stamp the devplan markdown (frontmatter + footer + zero-width)
    const markdown = stampMarkdown(
      renderDevplanMarkdown(project.name, project.currentphase, rows),
      { kind: 'generated', version: APP_VERSION, generator: 'devplan' }
    );

    const outDir = resolve(process.cwd(), 'specs', 'projects', projectid);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, 'developmentplan.md');
    await writeFile(outPath, markdown, 'utf-8');

    logger.info({ projectid, projectName: project.name, specCount: rows.length, outPath }, 'Development plan markdown generated');

    return { projectid, projectName: project.name, markdown, outputPath: outPath, specCount: rows.length };
  }
}
// [SCOPE 081 / T010] END

// [SCOPE 081 / T010] BEGIN — Development Plan viewer route + in-app review/print
function renderDevplanMarkdown(projectName: string, currentPhase: string, rows: SpecRoadmapRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const bucket = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) bucket[r.order] += 1;

  // START HERE summary.
  const inProgress = rows.filter((r) => r.progress > 0 && r.progress < 100);
  const notStarted = rows.filter((r) => r.progress === 0);
  const nextAction = inProgress[0] ?? notStarted[0] ?? null;

  const sections: string[] = [];
  sections.push(`# Development Plan`, '');
  sections.push(`**${projectName}** — build roadmap`, '');
  sections.push(`- **Current Phase**: ${currentPhase}`);
  sections.push(`- **Total Specs**: ${rows.length}`);
  sections.push(`- **Generated**: ${today}`, '');
  sections.push('---', '');
  sections.push('## ▶ START HERE', '');
  sections.push(`- **Built:** ${rows.filter((r) => r.progress >= 100).length} · **In progress:** ${inProgress.length} · **Not started:** ${notStarted.length}`);
  sections.push(`- **Single next action:** ${nextAction ? `Spec ${nextAction.specnumber} — ${nextAction.title} (${nextAction.status})` : 'All specs released'}`, '');
  sections.push('> The full dependency map + critical path live in the Dev Cockpit "Development Plan" panel and the on-demand `dev-plan` skill PDF.', '');
  sections.push('---', '');

  // Status at a glance, grouped foundation-up by phase.
  sections.push('## Status at a glance', '');
  sections.push('Legend: 🟢 built · 🟡 in progress · 🔴 not started.', '');
  for (const phase of PHASE_ORDER) {
    const inPhase = rows.filter((r) => r.order === phase.order);
    if (inPhase.length === 0) continue;
    sections.push(`### ${phase.label}`, '');
    sections.push('| Spec | Title | State | Progress |', '|------|-------|-------|----------|');
    for (const r of inPhase) {
      const safeTitle = r.title.replace(/[|\n]/g, ' ').slice(0, 60);
      sections.push(`| ${r.specnumber} | ${safeTitle} | ${stateEmoji(r.progress)} | ${r.progress}% |`);
    }
    sections.push('');
  }
  sections.push('---', '');

  // Scopes-per-phase bar.
  sections.push('## Phase distribution', '');
  sections.push('```mermaid');
  sections.push('xychart-beta');
  sections.push('    title "Scopes per Lifecycle Phase"');
  sections.push('    x-axis ["Scoping", "Design", "Implementation", "QA", "Human", "Beta", "Released"]');
  sections.push(`    y-axis "Scopes" 0 --> ${Math.max(10, ...bucket)}`);
  sections.push(`    bar [${bucket.join(', ')}]`);
  sections.push('```', '');
  sections.push(`*Generated per-project from \`projectspecifications\`. The auto-refreshed deterministic skeleton with the dependency map is the \`devplan\` doctype (mcp-server).*`);
  return sections.join('\n');
}
// [SCOPE 081 / T010] END
