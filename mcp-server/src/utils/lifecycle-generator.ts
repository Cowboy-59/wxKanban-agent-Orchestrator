/**
 * Lifecycle Generator Module
 * 
 * Generates lifecycle files for specs and updates project lifecycle.
 * Part of 017 MCP Project Hub - createSpecs tool
 */

import { db } from '../db/connection.js';
import { projectdocuments, projectspecifications } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import logger from './logger.js';

// Lifecycle phase definitions
export const LIFECYCLE_PHASES = [
  { id: 0, name: 'Scoping', status: 'draft', description: 'Scope doc drafted' },
  { id: 1, name: 'Design', status: 'planned', description: 'spec.md + plan.md + tasks.md + lifecycle.json' },
  { id: 2, name: 'Implementation', status: 'implementing', description: 'AI tasks coded, tests passing' },
  { id: 3, name: 'QA Testing', status: 'qa', description: 'Automated tests >90% coverage' },
  { id: 4, name: 'Human Testing', status: 'human_testing', description: 'UAT sign-off, no P0/P1 bugs' },
  { id: 5, name: 'Beta Release', status: 'beta', description: 'Limited production, metrics stable' },
  { id: 6, name: 'Released', status: 'released', description: 'GA deployed, monitoring active' },
] as const;

export type LifecyclePhase = typeof LIFECYCLE_PHASES[number]['name'];

// Spec lifecycle data structure
export interface SpecLifecycleData {
  specNumber: string;
  featureName: string;
  currentPhase: number;
  status: string;
  progress: number;
  phases: {
    phase: number;
    name: string;
    status: 'pending' | 'active' | 'complete';
    startedAt?: string;
    completedAt?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate lifecycle.json content for a spec
 */
export function generateSpecLifecycleJson(
  specNumber: string,
  featureName: string,
  currentPhase: number = 0,
  progress: number = 0
): SpecLifecycleData {
  const now = new Date().toISOString();
  
  return {
    specNumber,
    featureName,
    currentPhase,
    status: LIFECYCLE_PHASES[currentPhase]?.status || 'draft',
    progress,
    phases: LIFECYCLE_PHASES.map((phase) => ({
      phase: phase.id,
      name: phase.name,
      status: phase.id === currentPhase ? 'active' : phase.id < currentPhase ? 'complete' : 'pending',
      startedAt: phase.id === currentPhase ? now : phase.id < currentPhase ? now : undefined,
      completedAt: phase.id < currentPhase ? now : undefined,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate lifecycle.md content for a spec
 */
export function generateSpecLifecycleMarkdown(
  specNumber: string,
  featureName: string,
  lifecycleData: SpecLifecycleData
): string {
  const phaseRows = lifecycleData.phases.map((p) => {
    const statusIcon = p.status === 'complete' ? '✅' : p.status === 'active' ? '🔄' : '⏳';
    return `| ${p.phase} | ${p.name} | ${statusIcon} ${p.status} | ${p.startedAt || '-'} | ${p.completedAt || '-'} |`;
  }).join('\n');

  return `# Spec ${specNumber} — ${featureName} Lifecycle

## Current Status

- **Phase**: ${LIFECYCLE_PHASES[lifecycleData.currentPhase]?.name || 'Unknown'} (Phase ${lifecycleData.currentPhase})
- **Status**: ${lifecycleData.status}
- **Progress**: ${lifecycleData.progress}%

## Phase Timeline

| Phase # | Name | Status | Started | Completed |
|---------|------|--------|---------|-----------|
${phaseRows}

## Phase Definitions

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

## DB Status to Phase Mapping

\`\`\`mermaid
flowchart LR
    draft["draft\\nPhase 0 — Scoping"] --> planned
    planned["planned\\nPhase 1 — Design"] --> clarified
    clarified["clarified\\nPhase 1 — Design\\nQ&A complete"] --> tasks_generated
    tasks_generated["tasks_generated\\nPhase 1 Complete\\nspec+plan+tasks done"] --> implementing
    implementing["implementing\\nPhase 2 — Implementation\\nActive development"] --> implemented
    implemented["implemented\\nPhase 2 Complete\\nReady for QA"] --> qa
    qa["qa\\nPhase 3 — QA Testing\\nAutomated tests"] --> human_testing
    human_testing["human_testing\\nPhase 4 — Human Testing\\nUAT in progress"] --> beta
    beta["beta\\nPhase 5 — Beta Release\\nLimited production"] --> released
    released["released\\nPhase 6 — Released\\nGeneral availability"]

    style draft fill:#6b7280,color:#fff
    style planned fill:#3b82f6,color:#fff
    style clarified fill:#3b82f6,color:#fff
    style tasks_generated fill:#3b82f6,color:#fff
    style implementing fill:#f59e0b,color:#fff
    style implemented fill:#f59e0b,color:#fff
    style qa fill:#8b5cf6,color:#fff
    style human_testing fill:#ec4899,color:#fff
    style beta fill:#10b981,color:#fff
    style released fill:#059669,color:#fff
\`\`\`

---

*Generated by MCP Project Hub createSpecs tool*
*Last updated: ${new Date().toISOString()}*
`;
}

/**
 * Generate projectlifecycle.md content
 */
export function generateProjectLifecycleMarkdown(specs: Array<{
  specNumber: string;
  featureName: string;
  currentPhase: number;
  status: string;
  progress: number;
}>): string {
  const sortedSpecs = [...specs].sort((a, b) => a.specNumber.localeCompare(b.specNumber));
  
  // Calculate phase distribution
  const phaseCounts = new Array(7).fill(0);
  sortedSpecs.forEach(spec => {
    const phase = Math.min(spec.currentPhase, 6);
    phaseCounts[phase]++;
  });

  const specNumbers = sortedSpecs.map(s => `"${s.specNumber}"`);
  const progressValues = sortedSpecs.map(s => s.progress);
  
  // Group specs by phase for Gantt chart
  const specsByPhase = LIFECYCLE_PHASES.map(phase => ({
    phase: phase.name,
    specs: sortedSpecs.filter(s => s.currentPhase === phase.id),
  }));

  const ganttRows = specsByPhase.map(group => {
    if (group.specs.length === 0) return '';
    const sectionSpecs = group.specs.map(s => 
      `        ${s.specNumber} ${s.featureName.substring(0, 30)}${s.featureName.length > 30 ? '...' : ''} : ${s.status === 'active' ? 'active' : 'done'}, ${s.currentPhase}, ${s.currentPhase + 1}`
    ).join('\n');
    return `    section ${group.phase}\n${sectionSpecs}`;
  }).filter(Boolean).join('\n');

  // Mindmap data
  const mindmapData = specsByPhase.map(group => {
    if (group.specs.length === 0) return '';
    const specsList = group.specs.map(s => 
      `      ${s.specNumber} ${s.featureName.substring(0, 25)}${s.featureName.length > 25 ? '...' : ''}\n        ${s.status} · ${s.progress}%`
    ).join('\n');
    return `    ${group.phase}\n${specsList}`;
  }).filter(Boolean).join('\n');

  // In Progress Highlights
  const inProgressSpecs = sortedSpecs.filter(s => s.currentPhase >= 1 && s.currentPhase <= 5);
  const highlights = inProgressSpecs.slice(0, 5).map(spec => {
    const phaseName = LIFECYCLE_PHASES[spec.currentPhase]?.name || 'Unknown';
    return `### Spec ${spec.specNumber} — ${spec.featureName} 🔄 ${phaseName}
- **Progress**: ${spec.progress}%
- **Phase**: ${phaseName} (Phase ${spec.currentPhase})`;
  }).join('\n\n');

  // Upcoming Priorities (scoping phase)
  const upcomingSpecs = sortedSpecs.filter(s => s.currentPhase === 0).slice(0, 3);
  const priorities = upcomingSpecs.map((spec, idx) => 
    `${idx + 1}. **Spec ${spec.specNumber}** (${spec.featureName}) — ${spec.status}`
  ).join('\n');

  return `# Project Lifecycle Summary

**wxKanban Platform Development Lifecycle**  
*Aggregated view of all scope lifecycles*

---

## Overview

### Scope Progress (%)

\`\`\`mermaid
xychart-beta
    title "Scope Completion Progress (%)"
    x-axis [${specNumbers.join(', ')}]
    y-axis "Progress %" 0 --> 100
    bar [${progressValues.join(', ')}]
\`\`\`

### Scope Status by Phase

\`\`\`mermaid
gantt
    title wxKanban — Scope Lifecycle Status
    dateFormat X
    axisFormat Phase %s
    
${ganttRows}
\`\`\`

### Scope Detail by Phase

\`\`\`mermaid
mindmap
  root((wxKanban\\n${sortedSpecs.length} Scopes))
${mindmapData}
\`\`\`

---

## Phase Distribution

\`\`\`mermaid
pie title Phase Distribution — wxKanban Scopes (${sortedSpecs.length} total)
    "Scoping / Design" : ${phaseCounts[0] + phaseCounts[1]}
    "Implementation" : ${phaseCounts[2]}
    "QA Testing" : ${phaseCounts[3]}
    "Human Testing" : ${phaseCounts[4]}
    "Beta Release" : ${phaseCounts[5]}
    "Released" : ${phaseCounts[6]}
\`\`\`

\`\`\`mermaid
xychart-beta
    title "Scopes per Lifecycle Phase"
    x-axis ["Scoping/Design", "Implementation", "QA Testing", "Human Testing", "Beta Release", "Released"]
    y-axis "Scopes" 0 --> ${Math.max(...phaseCounts, 10)}
    bar [${phaseCounts[0] + phaseCounts[1]}, ${phaseCounts[2]}, ${phaseCounts[3]}, ${phaseCounts[4]}, ${phaseCounts[5]}, ${phaseCounts[6]}]
\`\`\`

---

## Recently Completed

${phaseCounts[6] > 0 ? sortedSpecs.filter(s => s.currentPhase === 6).map(s => `- **Spec ${s.specNumber}** — ${s.featureName}`).join('\n') : '*No scopes currently released*'}

---

## In Progress Highlights

${highlights || '*No specs currently in progress*'}

---

## Upcoming Priorities

${priorities || '*No upcoming priorities*'}

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

## DB Status to Phase Mapping

\`\`\`mermaid
flowchart LR
    draft["draft\\nPhase 0 — Scoping"] --> planned
    planned["planned\\nPhase 1 — Design"] --> clarified
    clarified["clarified\\nPhase 1 — Design\\nQ&A complete"] --> tasks_generated
    tasks_generated["tasks_generated\\nPhase 1 Complete\\nspec+plan+tasks done"] --> implementing
    implementing["implementing\\nPhase 2 — Implementation\\nActive development"] --> implemented
    implemented["implemented\\nPhase 2 Complete\\nReady for QA"] --> qa
    qa["qa\\nPhase 3 — QA Testing\\nAutomated tests"] --> human_testing
    human_testing["human_testing\\nPhase 4 — Human Testing\\nUAT in progress"] --> beta
    beta["beta\\nPhase 5 — Beta Release\\nLimited production"] --> released
    released["released\\nPhase 6 — Released\\nGeneral availability"]

    style draft fill:#6b7280,color:#fff
    style planned fill:#3b82f6,color:#fff
    style clarified fill:#3b82f6,color:#fff
    style tasks_generated fill:#3b82f6,color:#fff
    style implementing fill:#f59e0b,color:#fff
    style implemented fill:#f59e0b,color:#fff
    style qa fill:#8b5cf6,color:#fff
    style human_testing fill:#ec4899,color:#fff
    style beta fill:#10b981,color:#fff
    style released fill:#059669,color:#fff
\`\`\`

---

## Notes

- This summary aggregates individual scope lifecycles from \`specs/{scope}/lifecycle.json\`
- Each scope maintains its own detailed lifecycle tracking in \`lifecycle.json\`
- Update this file after each scope lifecycle change via \`wxai lifecycle\` command
- **Last updated: ${new Date().toISOString()}**
- **Phase Distribution MUST always use Mermaid charts** — a \`pie\` chart for distribution and an \`xychart-beta\` bar chart for full lifecycle pipeline order. Never use ASCII bar charts in this section.

### Update Workflow (Standard)

Every time \`projectlifecycle.md\` is updated, the **last step** is always to push it to the database:

\`\`\`bash
node ai_utilities/push-lifecycle.mjs
\`\`\`

This inserts or updates the \`specs/projectlifecycle.md\` record in the \`projectdocuments\` table so the live wxKanban application reflects the latest lifecycle state.

**Full update sequence:**
1. Edit \`specs/projectlifecycle.md\` with current scope statuses, progress %, and phase assignments
2. Update the \`xychart-beta\` progress bar values and \`gantt\` section groupings
3. Update the \`pie\` and \`xychart-beta\` phase distribution counts
4. Update "In Progress Highlights" and "Upcoming Priorities" sections
5. Update \`Last updated\` date in Notes
6. **Run \`node ai_utilities/push-lifecycle.mjs\`** — push to \`projectdocuments\` table (always last)

---

*Generated from scope lifecycle reports. See individual \`specs/{scope}/lifecycle.json\` files for detailed phase tracking.*
`;
}

/**
 * Push lifecycle document to database
 */
export async function pushLifecycleToDb(
  projectId: string,
  content: string,
  title: string = 'wxKanban Platform Development Lifecycle — Aggregated View',
  filepath: string = 'specs/projectlifecycle.md'
): Promise<{ id: string; created: boolean }> {
  // Check for existing document
  const existingDocs = await db
    .select()
    .from(projectdocuments)
    .where(and(
      eq(projectdocuments.projectId, projectId),
      eq(projectdocuments.filepath, filepath)
    ))
    .limit(1);

  if (existingDocs.length > 0) {
    // Update existing
    const [updated] = await db
      .update(projectdocuments)
      .set({
        content,
        title,
        updatedAt: new Date(),
      })
      .where(eq(projectdocuments.id, existingDocs[0].id))
      .returning();
    
    logger.info('Updated lifecycle document in DB', { documentId: updated.id });
    return { id: updated.id, created: false };
  } else {
    // Create new
    const [created] = await db
      .insert(projectdocuments)
      .values({
        projectId,
        title,
        content,
        filepath,
        doctype: 'lifecycle',
        isGenerated: false,
      })
      .returning();
    
    logger.info('Created lifecycle document in DB', { documentId: created.id });
    return { id: created.id, created: true };
  }
}

/**
 * Get all specs for project lifecycle aggregation
 */
export async function getAllSpecsForLifecycle(projectId: string): Promise<Array<{
  specNumber: string;
  featureName: string;
  currentPhase: number;
  status: string;
  progress: number;
}>> {
  const specs = await db
    .select()
    .from(projectspecifications)
    .where(eq(projectspecifications.projectId, projectId));

  return specs.map(spec => ({
    specNumber: spec.specNumber,
    featureName: spec.title,
    currentPhase: getPhaseFromStatus(spec.status),
    status: spec.status,
    progress: calculateProgress(spec.status),
  }));
}

/**
 * Map DB status to lifecycle phase
 */
function getPhaseFromStatus(status: string): number {
  const statusMap: Record<string, number> = {
    'draft': 0,
    'planned': 1,
    'clarified': 1,
    'tasks_generated': 1,
    'implementing': 2,
    'implemented': 2,
    'qa': 3,
    'human_testing': 4,
    'beta': 5,
    'released': 6,
  };
  return statusMap[status] ?? 0;
}

/**
 * Calculate progress percentage from status
 */
function calculateProgress(status: string): number {
  const progressMap: Record<string, number> = {
    'draft': 0,
    'planned': 10,
    'clarified': 20,
    'tasks_generated': 25,
    'implementing': 40,
    'implemented': 60,
    'qa': 75,
    'human_testing': 85,
    'beta': 95,
    'released': 100,
  };
  return progressMap[status] ?? 0;
}
