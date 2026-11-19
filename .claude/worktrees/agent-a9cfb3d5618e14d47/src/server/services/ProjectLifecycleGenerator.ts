import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projectspecifications } from '~/db/schema/projectspecification.js';
import { eq } from 'drizzle-orm';
import { readdir, mkdir, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { createLogger } from '~/server/lib/logger.js';
import { stampMarkdown } from '@wxkanban/watermark';
import { APP_VERSION } from '~/client/version.js';

const logger = createLogger('project-lifecycle-generator');

// Maps projectspecifications.status → lifecycle phase number (0-6) and label.
// Aligned with the flowchart in specs/projectlifecycle.md.
const STATUS_TO_PHASE: Record<string, { phase: number; label: string; progress: number }> = {
  draft: { phase: 0, label: 'Scoping', progress: 0 },
  in_review: { phase: 1, label: 'Design', progress: 10 },
  pending_clarification: { phase: 1, label: 'Design', progress: 15 },
  clarified: { phase: 1, label: 'Design', progress: 20 },
  planned: { phase: 1, label: 'Design', progress: 25 },
  tasks_generated: { phase: 1, label: 'Design', progress: 33 },
  implementing: { phase: 2, label: 'Implementation', progress: 50 },
  implemented: { phase: 2, label: 'Implementation', progress: 66 },
  qa_passed: { phase: 3, label: 'QA Testing', progress: 75 },
  human_tested: { phase: 4, label: 'Human Testing', progress: 85 },
  beta_cleared: { phase: 5, label: 'Beta Release', progress: 95 },
  released: { phase: 6, label: 'Released', progress: 100 },
  deferred: { phase: 0, label: 'Scoping', progress: 0 },
};

const PHASE_LABELS = [
  'Scoping / Design',
  'Implementation',
  'QA Testing',
  'Human Testing',
  'Beta Release',
  'Released',
];

interface SpecSummary {
  specnumber: string;
  title: string;
  status: string;
  phase: number;
  phaseLabel: string;
  progress: number;
  specDir: string | null;
}

async function findSpecDir(specnumber: string): Promise<string | null> {
  const specsRoot = resolve(process.cwd(), 'specs');
  try {
    const entries = await readdir(specsRoot, { withFileTypes: true });
    const match = entries.find(
      (e) => e.isDirectory() && e.name.startsWith(`${specnumber}-`)
    );
    return match ? join(specsRoot, match.name) : null;
  } catch {
    return null;
  }
}

export interface LifecycleGenerationResult {
  projectid: string;
  projectName: string;
  markdown: string;
  outputPath: string;
  specCount: number;
}

export class ProjectLifecycleGenerator {
  /**
   * Generate per-project lifecycle markdown and write it to
   * specs/projects/<projectid>/projectlifecycle.md. Does NOT render PDF or
   * upsert to the DB — callers chain those steps.
   */
  static async generate(projectid: string): Promise<LifecycleGenerationResult> {
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

    const summaries: SpecSummary[] = await Promise.all(
      specs.map(async (s) => {
        const mapping = STATUS_TO_PHASE[s.status] ?? {
          phase: 0,
          label: 'Scoping',
          progress: 0,
        };
        return {
          specnumber: s.specnumber,
          title: s.title,
          status: s.status,
          phase: mapping.phase,
          phaseLabel: mapping.label,
          progress: mapping.progress,
          specDir: await findSpecDir(s.specnumber),
        };
      })
    );

    // [SCOPE 082 / T006] stamp the lifecycle markdown (frontmatter + footer + zero-width)
    const markdown = stampMarkdown(
      renderMarkdown(project.name, project.currentphase, summaries),
      { kind: 'generated', version: APP_VERSION, generator: 'lifecycle' }
    );

    const outDir = resolve(process.cwd(), 'specs', 'projects', projectid);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, 'projectlifecycle.md');
    await writeFile(outPath, markdown, 'utf-8');

    logger.info(
      { projectid, projectName: project.name, specCount: summaries.length, outPath },
      'Project lifecycle markdown generated'
    );

    return {
      projectid,
      projectName: project.name,
      markdown,
      outputPath: outPath,
      specCount: summaries.length,
    };
  }
}

function renderMarkdown(
  projectName: string,
  currentPhase: string,
  specs: SpecSummary[]
): string {
  const today = new Date().toISOString().slice(0, 10);

  // Phase distribution counts (buckets 0..5 in PHASE_LABELS order).
  // Phase 0 (Scoping) rolls into "Scoping / Design" with phase 1.
  const bucket = [0, 0, 0, 0, 0, 0];
  for (const s of specs) {
    const idx = s.phase <= 1 ? 0 : Math.min(s.phase - 1, 5);
    bucket[idx] += 1;
  }

  // Pie excludes zero buckets
  const pieLines = PHASE_LABELS
    .map((label, i) => ({ label, n: bucket[i] }))
    .filter((b) => b.n > 0)
    .map((b) => `    "${b.label}" : ${b.n}`)
    .join('\n');

  const barValues = bucket.join(', ');

  // xychart-beta progress bar
  const xAxis = specs.map((s) => `"${s.specnumber}"`).join(', ');
  const progressBar = specs.map((s) => s.progress).join(', ');

  // Gantt sections grouped by phase label
  const ganttByPhase = new Map<string, SpecSummary[]>();
  for (const s of specs) {
    const key = s.phase === 0 ? 'Design' : s.phaseLabel;
    const arr = ganttByPhase.get(key) ?? [];
    arr.push(s);
    ganttByPhase.set(key, arr);
  }
  const ganttLines: string[] = [];
  for (const [phaseLabel, list] of ganttByPhase.entries()) {
    ganttLines.push(`    section ${phaseLabel}`);
    for (const s of list) {
      const safeTitle = s.title.replace(/[:\n]/g, ' ').slice(0, 40);
      ganttLines.push(`        ${s.specnumber} ${safeTitle} : active, 0, 1`);
    }
  }

  // In-progress highlights
  const inProgress = specs.filter((s) => s.progress > 0 && s.progress < 100);
  const highlightsBlocks = inProgress.length
    ? inProgress
        .map(
          (s) =>
            `### Spec ${s.specnumber} — ${s.title} 🔄 ${s.phaseLabel}\n- **Progress**: ${s.progress}%\n- **Phase**: ${s.phaseLabel} (Phase ${s.phase})\n- **Status**: \`${s.status}\``
        )
        .join('\n\n')
    : '*No specs currently in progress*';

  // Upcoming = phase 0 or draft
  const upcoming = specs.filter((s) => s.progress === 0);
  const upcomingBlock = upcoming.length
    ? upcoming
        .map((s, i) => `${i + 1}. **Spec ${s.specnumber}** (${s.title}) — ${s.status}`)
        .join('\n')
    : '*No upcoming specs queued*';

  // Completed
  const completed = specs.filter((s) => s.progress === 100);
  const completedBlock = completed.length
    ? completed
        .map((s) => `- Spec ${s.specnumber} — ${s.title}`)
        .join('\n')
    : '*No specs currently released*';

  return `# Project Lifecycle Summary

**${projectName}**
*Per-project lifecycle view*

- **Current Phase**: ${currentPhase}
- **Total Specs**: ${specs.length}
- **Generated**: ${today}

---

## Overview

### Scope Progress (%)

\`\`\`mermaid
xychart-beta
    title "Scope Completion Progress (%)"
    x-axis [${xAxis || '"—"'}]
    y-axis "Progress %" 0 --> 100
    bar [${progressBar || '0'}]
\`\`\`

### Scope Status by Phase

\`\`\`mermaid
gantt
    title ${projectName} — Scope Lifecycle Status
    dateFormat X
    axisFormat Phase %s
${ganttLines.join('\n') || '    section Design\n        (no specs) : active, 0, 1'}
\`\`\`

---

## Phase Distribution

\`\`\`mermaid
pie title Phase Distribution — ${projectName} (${specs.length} total)
${pieLines || '    "Scoping / Design" : 0'}
\`\`\`

\`\`\`mermaid
xychart-beta
    title "Scopes per Lifecycle Phase"
    x-axis ["Scoping/Design", "Implementation", "QA Testing", "Human Testing", "Beta Release", "Released"]
    y-axis "Scopes" 0 --> ${Math.max(10, ...bucket)}
    bar [${barValues}]
\`\`\`

---

## Recently Completed

${completedBlock}

---

## In Progress Highlights

${highlightsBlocks}

---

## Upcoming Priorities

${upcomingBlock}

---

## Lifecycle Definitions

\`\`\`mermaid
flowchart LR
    S0["0. Scoping\\nScope doc drafted"] -->|"Scope doc exists"| S1
    S1["1. Design\\nspec.md + plan.md\\n+ tasks.md + lifecycle.json"] -->|"Tasks in DB"| S2
    S2["2. Implementation\\nAI tasks coded\\ntests passing"] -->|"All tasks done"| S3
    S3["3. QA Testing\\nAutomated tests\\n>90% coverage"] -->|"QA passed"| S4
    S4["4. Human Testing\\nUAT sign-off\\nno P0/P1 bugs"] -->|"UAT passed"| S5
    S5["5. Beta Release\\nLimited production\\nmetrics stable"] -->|"Beta stable"| S6
    S6["6. Released\\nGA deployed\\nmonitoring active"]

    style S0 fill:#6b7280,color:#fff
    style S1 fill:#3b82f6,color:#fff
    style S2 fill:#f59e0b,color:#fff
    style S3 fill:#8b5cf6,color:#fff
    style S4 fill:#ec4899,color:#fff
    style S5 fill:#10b981,color:#fff
    style S6 fill:#059669,color:#fff
\`\`\`

---

*Generated per-project from \`projectspecifications\` table. Spec-level detail lives in each \`specs/{scope}/lifecycle.json\`.*
`;
}
