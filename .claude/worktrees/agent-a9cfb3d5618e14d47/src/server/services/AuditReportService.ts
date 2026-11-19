import { db } from '~/db/client.js';
import { companyprojects as projects } from '~/db/schema/companyproject.js';
import { projecttasks as tasks } from '~/db/schema/projecttask.js';
import { projectspecifications as specifications } from '~/db/schema/projectspecification.js';

import { projectphases } from '~/db/schema/projectphase.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { wxkanbandocuments } from '~/db/schema/wxkanbandocuments.js';
import { getEnabledFrameworksByProject } from './AuditConfigService.js';
import { and, desc, eq, count, sql } from 'drizzle-orm';
import { ProjectDocumentService } from './ProjectDocumentService.js';
import { createLogger } from '~/server/lib/logger.js';
import type { ProjectDocument } from '~/shared/types/projects.js';

const logger = createLogger('audit-report-service');

// ─── Compliance rules source ──────────────────────────────────────────────────

// [SCOPE 112 / T009] BEGIN — Amendment A. Rules come from `wxkanbandocuments`, the
// master framework document store, not from markdown at `process.cwd()`. The old
// COMPLIANCE_FILES map resolved a filename and read it off the server's own working
// directory, which only ever worked because this repository happens to keep those
// files at its root — the same server-filesystem assumption that made
// project.implement unrunnable. `filecontent` is authoritative and hash-verified.
// [SCOPE 113 / FR-009,FR-010] MODIFIED-BY — NISTSSDF and ISO27001 gained rules
// documents and control catalogs (migrations 0014/0015), so they are reportable rather
// than enablement flags with nothing behind them.
const KNOWN_FRAMEWORKS = ['GDPR', 'HIPAA', 'HITRUST', 'SOC2', 'NISTSSDF', 'ISO27001'] as const;

async function loadFrameworkRules(framework: string): Promise<string | null> {
  const [doc] = await db
    .select({ filecontent: wxkanbandocuments.filecontent })
    .from(wxkanbandocuments)
    .where(and(
      eq(wxkanbandocuments.framework, framework),
      eq(wxkanbandocuments.documenttype, 'compliance_framework'),
      eq(wxkanbandocuments.status, 'active'),
    ))
    // Stale seed rows share the framework value; the longest active document is the
    // real ruleset. Ordering by length rather than date stops a 22-byte test row winning.
    .orderBy(desc(sql`length(coalesce(${wxkanbandocuments.filecontent}, ''))`))
    .limit(1);

  return doc?.filecontent ?? null;
}
// [SCOPE 112 / T009] END

// Maps wxKanban project phase → SDLC section name in compliance files
const PHASE_TO_SDLC: Record<string, string> = {
  Design:         'Design',
  Implementation: 'Development',
  QA:             'Testing',
  HumanTesting:   'Testing',
  Beta:           'Deployment',
  Release:        'Maintenance',
};

const SDLC_PHASES = ['Requirements', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance'] as const;
type SdlcPhase = typeof SDLC_PHASES[number];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  text: string;
  section: string;
  sdlcPhase: SdlcPhase | 'General';
}

interface ProjectMetrics {
  name: string;
  currentphase: string;
  framework: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  totalSpecs: number;
  advancedSpecs: number;
  completedPhases: number;
  inProgressPhases: number;
  pendingPhases: number;
  hasAuditReport: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AuditReportService {
  // [SCOPE 112 / T007] BEGIN — one report per ENABLED framework, replacing the single
  // `companyprojects.audittype` lookup. A project can be audited against several
  // frameworks at once (FR-001), and audittype could only ever hold one — so a company
  // shipping a HIPAA product and a SOC 2 one got a report for whichever value happened
  // to be set. Frameworks now come from appauditconfiguration via the project grain.
  /**
   * Generate and store one audit report per framework enabled on the project.
   * Returns an empty array when no framework is enabled.
   */
  static async generateReports(
    projectid: string,
    userid: string
  ): Promise<ProjectDocument[]> {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectid));
    if (!proj) throw new Error('Project not found');

    const enabled = await getEnabledFrameworksByProject(projectid);
    if (enabled.length === 0) {
      logger.info({ projectid }, 'No compliance framework enabled — skipping audit report generation');
      return [];
    }

    // A framework with no rules document must not produce an empty report that reads
    // like a clean one. All six now have content; the guard stays for the seventh.
    const reportable = enabled.filter((f) =>
      KNOWN_FRAMEWORKS.includes(f as (typeof KNOWN_FRAMEWORKS)[number]),
    );
    const deferred = enabled.filter((f) => !reportable.includes(f));
    if (deferred.length > 0) {
      logger.warn({ projectid, deferred }, 'Frameworks enabled without a rules document — not reported on');
    }

    const docs: ProjectDocument[] = [];
    for (const framework of reportable) {
      // [SCOPE 112 / T009] Amendment A — rules read from wxkanbandocuments, not disk.
      const complianceContent = await loadFrameworkRules(framework);
      if (!complianceContent) {
        // One missing document must not silently suppress the others, and must not
        // pass as a clean result either.
        logger.error({ projectid, framework }, 'No active compliance framework document in wxkanbandocuments');
        continue;
      }

      const metrics = await this.getProjectMetrics(projectid, framework);
      const checklistItems = this.extractChecklistItems(complianceContent);
      const reportContent = this.buildReport(framework, metrics, checklistItems);

      // Doctype carries the framework so several reports coexist on one project
      // instead of overwriting each other through a shared 'AuditReport' key.
      const doc = await ProjectDocumentService.upsertDocument(
        projectid,
        `AuditReport:${framework}`,
        `${framework} Compliance Audit Report`,
        reportContent,
        userid
      );
      docs.push(doc);
      logger.info({ projectid, framework, docid: doc.id }, 'Audit report generated and stored');
    }

    return docs;
  }

  /**
   * @deprecated SPEC-112 T007 — single-framework entry point. Returns the first
   * generated report so existing callers keep working; use generateReports.
   */
  static async generateReport(
    projectid: string,
    userid: string
  ): Promise<ProjectDocument | null> {
    const docs = await this.generateReports(projectid, userid);
    return docs[0] ?? null;
  }
  // [SCOPE 112 / T007] END

  // ─── Private helpers ────────────────────────────────────────────────────────

  private static async getProjectMetrics(
    projectid: string,
    framework: string
  ): Promise<ProjectMetrics> {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectid));
    if (!proj) throw new Error('Project not found');

    // Task stats
    const [taskStats] = await db
      .select({
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'completed')`,
        open: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'open')`,
      })
      .from(tasks)
      .where(eq(tasks.projectid, projectid));

    // Spec stats — "advanced" = past design/draft stages
    const [specStats] = await db
      .select({
        total: count(),
        advanced: sql<number>`COUNT(*) FILTER (WHERE ${specifications.status} IN (
          'implementing','implemented','qa_passed','human_tested','beta_cleared','released'
        ))`,
      })
      .from(specifications)
      .where(eq(specifications.projectid, projectid));

    // Phase stats
    const phases = await db
      .select({ status: projectphases.status })
      .from(projectphases)
      .where(eq(projectphases.projectid, projectid));

    // Check if audit report already exists
    const [existingReport] = await db
      .select({ id: projectdocuments.id })
      .from(projectdocuments)
      .where(
        eq(projectdocuments.projectid, projectid)
      )
      .limit(1);

    return {
      name: proj.name,
      currentphase: proj.currentphase,
      framework,
      totalTasks: Number(taskStats?.total ?? 0),
      completedTasks: Number(taskStats?.completed ?? 0),
      openTasks: Number(taskStats?.open ?? 0),
      totalSpecs: Number(specStats?.total ?? 0),
      advancedSpecs: Number(specStats?.advanced ?? 0),
      completedPhases: phases.filter(p => p.status === 'complete').length,
      inProgressPhases: phases.filter(p => p.status === 'in_progress').length,
      pendingPhases: phases.filter(p => p.status === 'pending').length,
      hasAuditReport: !!existingReport,
    };
  }

  private static extractChecklistItems(content: string): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const lines = content.split('\n');
    let currentSection = 'General';
    let currentSdlcPhase: SdlcPhase | 'General' = 'General';

    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.replace(/^## /, '').trim();
        // Map section to SDLC phase
        const matched = SDLC_PHASES.find(p =>
          currentSection.toLowerCase().includes(p.toLowerCase())
        );
        currentSdlcPhase = matched ?? 'General';
      } else if (line.startsWith('### ')) {
        const sub = line.replace(/^### /, '').trim();
        const matched = SDLC_PHASES.find(p =>
          sub.toLowerCase().includes(p.toLowerCase())
        );
        if (matched) currentSdlcPhase = matched;
      } else if (line.startsWith('#### ')) {
        const sub = line.replace(/^#### /, '').trim();
        const matched = SDLC_PHASES.find(p =>
          sub.toLowerCase().includes(p.toLowerCase())
        );
        if (matched) currentSdlcPhase = matched;
      }

      const checklistMatch = line.match(/^- \[ \] (.+)/);
      if (checklistMatch) {
        items.push({
          text: checklistMatch[1].trim(),
          section: currentSection,
          sdlcPhase: currentSdlcPhase,
        });
      }
    }

    return items;
  }

  private static buildReport(
    framework: string,
    metrics: ProjectMetrics,
    checklistItems: ChecklistItem[]
  ): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentSdlcPhase = PHASE_TO_SDLC[metrics.currentphase] ?? metrics.currentphase;

    // Compliance score estimate
    const taskRate = metrics.totalTasks > 0
      ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100) : 0;
    const specRate = metrics.totalSpecs > 0
      ? Math.round((metrics.advancedSpecs / metrics.totalSpecs) * 100) : 0;
    const phaseRate = Math.round((metrics.completedPhases / 6) * 100);
    const overallScore = Math.round(taskRate * 0.45 + specRate * 0.30 + phaseRate * 0.25);
    const partial = Math.min(25, Math.max(0, 100 - overallScore - 10));
    const notStarted = Math.max(0, 100 - overallScore - partial);

    const statusEmoji = overallScore >= 70 ? '✅ On Track' : overallScore >= 40 ? '⚠️ Needs Attention' : '❌ Action Required';

    // Group checklist items by SDLC phase
    const byPhase: Record<string, ChecklistItem[]> = {};
    for (const phase of SDLC_PHASES) {
      byPhase[phase] = checklistItems.filter(i => i.sdlcPhase === phase);
    }
    const currentPhaseItems = byPhase[currentSdlcPhase] ?? [];
    const maxItems = Math.max(...SDLC_PHASES.map(p => byPhase[p]?.length ?? 0), 1);

    // Phase-to-project mapping for summary table
    const phaseToProject: Record<string, string> = {
      Requirements: 'Design',
      Design:       'Design',
      Development:  'Implementation',
      Testing:      'QA / Human Testing',
      Deployment:   'Beta',
      Maintenance:  'Release',
    };

    const lines: string[] = [
      `# ${framework} Compliance Audit Report`,
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Project** | ${metrics.name} |`,
      `| **Framework** | ${framework} |`,
      `| **Generated** | ${dateStr} |`,
      `| **Current Phase** | ${metrics.currentphase} (SDLC: ${currentSdlcPhase}) |`,
      `| **Overall Status** | ${statusEmoji} |`,
      `| **Compliance Score** | ${overallScore}% |`,
      '',
      '---',
      '',
      '## Executive Summary',
      '',
      `This report assesses the **${framework}** compliance posture of **${metrics.name}** ` +
      `as of ${dateStr}. The project is currently in the **${metrics.currentphase}** phase.`,
      '',
      `- **Tasks**: ${metrics.completedTasks} of ${metrics.totalTasks} completed (${taskRate}%)`,
      `- **Scopes**: ${metrics.advancedSpecs} of ${metrics.totalSpecs} advanced to implementation or beyond (${specRate}%)`,
      `- **Lifecycle Phases**: ${metrics.completedPhases} of 6 complete`,
      `- **Estimated Compliance Readiness**: ${overallScore}%`,
      '',
      '---',
      '',
      '## Compliance Score',
      '',
      '```mermaid',
      `pie title ${framework} Compliance Readiness — ${metrics.name}`,
      `    "Compliant" : ${overallScore}`,
      `    "Partial" : ${partial}`,
      `    "Not Started" : ${notStarted}`,
      '```',
      '',
      '---',
      '',
      '## SDLC Phase Checklist Coverage',
      '',
      '```mermaid',
      'xychart-beta',
      `    title "${framework} Checklist Items per SDLC Phase"`,
      `    x-axis ["Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"]`,
      `    y-axis "Items" 0 --> ${maxItems + 2}`,
      `    bar [${SDLC_PHASES.map(p => byPhase[p]?.length ?? 0).join(', ')}]`,
      '```',
      '',
      '---',
      '',
      '## Project Lifecycle Status',
      '',
      '```mermaid',
      `pie title Lifecycle Phase Completion — ${metrics.name}`,
      `    "Complete" : ${metrics.completedPhases}`,
      `    "In Progress" : ${metrics.inProgressPhases}`,
      `    "Pending" : ${metrics.pendingPhases}`,
      '```',
      '',
      '---',
      '',
      '## Task & Scope Metrics',
      '',
      '| Metric | Count | Rate | Status |',
      '|--------|-------|------|--------|',
      `| Tasks Completed | ${metrics.completedTasks} / ${metrics.totalTasks} | ${taskRate}% | ${taskRate >= 70 ? '✅' : taskRate >= 40 ? '⚠️' : '❌'} |`,
      `| Tasks Open | ${metrics.openTasks} | — | ${metrics.openTasks === 0 ? '✅ None' : `⚠️ ${metrics.openTasks} remaining`} |`,
      `| Scopes Advanced | ${metrics.advancedSpecs} / ${metrics.totalSpecs} | ${specRate}% | ${specRate >= 70 ? '✅' : specRate >= 40 ? '⚠️' : '❌'} |`,
      `| Phases Complete | ${metrics.completedPhases} / 6 | ${phaseRate}% | ${metrics.completedPhases >= 3 ? '✅' : '⚠️'} |`,
      '',
      '---',
      '',
      `## ${framework} Requirements — Current Phase: ${currentSdlcPhase}`,
      '',
    ];

    if (currentPhaseItems.length > 0) {
      lines.push(
        `The following **${currentPhaseItems.length}** ${framework} checklist items apply to the **${currentSdlcPhase}** phase:`,
        ''
      );
      const shown = currentPhaseItems.slice(0, 25);
      for (const item of shown) {
        lines.push(`- [ ] ${item.text}`);
      }
      if (currentPhaseItems.length > 25) {
        lines.push('', `> *...and ${currentPhaseItems.length - 25} more items. See full compliance rules for complete list.*`);
      }
    } else {
      lines.push(`> No specific checklist items extracted for the **${currentSdlcPhase}** phase from the ${framework} rules file.`);
    }

    lines.push(
      '',
      '---',
      '',
      '## All SDLC Phase Requirements Summary',
      '',
      '| SDLC Phase | Checklist Items | wxKanban Phase | Status |',
      '|------------|-----------------|----------------|--------|',
    );

    for (const phase of SDLC_PHASES) {
      const itemCount = byPhase[phase]?.length ?? 0;
      const projPhase = phaseToProject[phase] ?? phase;
      const isCurrent = phase === currentSdlcPhase;
      const marker = isCurrent ? ' ← **current**' : '';
      lines.push(`| ${phase}${marker} | ${itemCount} | ${projPhase} | ${isCurrent ? '🔄 Active' : metrics.completedPhases > SDLC_PHASES.indexOf(phase as SdlcPhase) ? '✅ Done' : '⏳ Pending'} |`);
    }

    lines.push(
      '',
      '---',
      '',
      '## Recommendations',
      '',
      `### Priority Actions for ${metrics.currentphase} Phase`,
      '',
    );

    const recs: string[] = [];
    if (metrics.openTasks > 0) {
      recs.push(`**Close open tasks** — ${metrics.openTasks} task(s) remain open. All tasks must be completed before advancing.`);
    }
    if (specRate < 50) {
      recs.push(`**Advance scopes** — Only ${specRate}% of scopes have progressed past design. Review and advance blocked scopes.`);
    }
    if (currentPhaseItems.length > 0) {
      recs.push(`**Complete ${framework} ${currentSdlcPhase} checklist** — ${currentPhaseItems.length} compliance items require review and sign-off.`);
    }
    recs.push(
      `**Document compliance evidence** — Maintain records for all ${framework} requirements as evidence for future audits.`,
      `**Schedule compliance review** — Conduct a formal ${framework} review before advancing to the next phase.`,
      `**Update audit report** — Re-run this report after completing the ${currentSdlcPhase} checklist to track progress.`
    );

    recs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

    lines.push(
      '',
      '---',
      '',
      '## Compliance Framework Reference',
      '',
      `| Framework | Source | Scope |`,
      `|-----------|--------|-------|`,
      `| ${framework} | wxKanban framework document store | Full SDLC compliance rules |`,
      '',
      `> *This report was generated automatically by the wxKanban Audit System on ${dateStr}. ` +
      `Compliance scores are estimated based on task completion, scope advancement, and phase progression. ` +
      `A formal compliance audit by a qualified assessor is required for regulatory certification.*`,
    );

    return lines.join('\n');
  }
}
