import { eq, and } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('project-learnings-generator');

interface LearningDoc {
  id: string;
  title: string;
  content: string;
  updatedat: Date;
}

interface ParsedLearning {
  title: string;
  type: string;
  complianceRelevant: boolean;
  frameworks: string[];
  body: string;
  updatedat: Date;
}

function parseFrontmatter(doc: LearningDoc): ParsedLearning {
  const fm = doc.content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fm) {
    return { title: doc.title, type: 'KNOWLEDGE', complianceRelevant: false, frameworks: [], body: doc.content, updatedat: doc.updatedat };
  }
  const yaml = fm[1];
  const body = fm[2].trim();
  const type = yaml.match(/^type:\s*(\S+)/m)?.[1]?.toUpperCase() ?? 'KNOWLEDGE';
  const complianceRelevant = /compliance_relevant:\s*true/m.test(yaml);
  const frameworkMatch = yaml.match(/^compliance_frameworks:\s*\[([^\]]*)\]/m);
  const frameworks = frameworkMatch
    ? frameworkMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))
    : [];
  return { title: doc.title, type, complianceRelevant, frameworks, body, updatedat: doc.updatedat };
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export interface LearningsGenerationResult {
  markdown: string;
  projectName: string;
  docCount: number;
  outputPath: string;
}

export class ProjectLearningsGenerator {
  static async generate(projectid: string): Promise<LearningsGenerationResult> {
    const [project] = await db
      .select({ id: companyprojects.id, name: companyprojects.name })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectid))
      .limit(1);

    if (!project) throw new Error(`Project not found: ${projectid}`);

    const docs = await db
      .select({
        id: projectdocuments.id,
        title: projectdocuments.title,
        content: projectdocuments.content,
        updatedat: projectdocuments.updatedat,
      })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.doctype, 'CompoundLearning')
        )
      );

    const parsed = docs.map(parseFrontmatter);

    const byType: Record<string, ParsedLearning[]> = {
      BUG: [],
      DECISION: [],
      PATTERN: [],
      COMPLIANCE: [],
      KNOWLEDGE: [],
    };

    const complianceDocs: ParsedLearning[] = [];

    for (const p of parsed) {
      const bucket = byType[p.type] ?? (byType[p.type] = []);
      bucket.push(p);
      if (p.complianceRelevant) complianceDocs.push(p);
    }

    const lines: string[] = [];

    lines.push(`# Project Learnings — ${project.name}`);
    lines.push('');
    lines.push(`**Generated**: ${fmtDate(new Date())}`);
    lines.push(`**Total Entries**: ${parsed.length}`);
    lines.push('');

    // Summary table
    if (parsed.length > 0) {
      lines.push('## Summary');
      lines.push('');
      lines.push('| Type | Count |');
      lines.push('|------|-------|');
      for (const [type, entries] of Object.entries(byType)) {
        if (entries.length > 0) {
          lines.push(`| ${type} | ${entries.length} |`);
        }
      }
      if (complianceDocs.length > 0) {
        lines.push(`| **Compliance Evidence** | **${complianceDocs.length}** |`);
      }
      lines.push('');
    }

    // Compliance Evidence section first — most important for audits
    if (complianceDocs.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Compliance Evidence');
      lines.push('');
      lines.push('> These entries document security controls, data handling decisions, and risk mitigations. Suitable for SOC 2 / HIPAA / HiTrust / GDPR audit evidence.');
      lines.push('');
      for (const doc of complianceDocs) {
        lines.push(`### ${doc.title}`);
        lines.push('');
        if (doc.frameworks.length > 0) {
          lines.push(`**Frameworks**: ${doc.frameworks.join(', ')}`);
          lines.push('');
        }
        lines.push(`**Last Updated**: ${fmtDate(doc.updatedat)}`);
        lines.push('');
        lines.push(doc.body);
        lines.push('');
      }
    }

    // Type sections
    const SECTION_TITLES: Record<string, string> = {
      BUG: 'Bugs & Fixes',
      DECISION: 'Architectural Decisions',
      PATTERN: 'Patterns Established',
      COMPLIANCE: 'Compliance Controls',
      KNOWLEDGE: 'Knowledge Base',
    };

    for (const [type, entries] of Object.entries(byType)) {
      if (entries.length === 0) continue;
      lines.push('---');
      lines.push('');
      lines.push(`## ${SECTION_TITLES[type] ?? type}`);
      lines.push('');
      for (const doc of entries) {
        lines.push(`### ${doc.title}`);
        lines.push('');
        lines.push(`**Last Updated**: ${fmtDate(doc.updatedat)}`);
        lines.push('');
        lines.push(doc.body);
        lines.push('');
      }
    }

    if (parsed.length === 0) {
      lines.push('---');
      lines.push('');
      lines.push('*No compound learnings have been documented for this project yet.*');
      lines.push('');
      lines.push('Run `/compound` after completing a scope, fixing a significant bug, or making an architectural decision to capture knowledge here.');
      lines.push('');
    }

    const markdown = lines.join('\n');
    const outputPath = `specs/projects/${projectid}/learnings-report.md`;

    logger.info({ projectid, docCount: parsed.length }, 'Learnings report generated');

    return {
      markdown,
      projectName: project.name,
      docCount: parsed.length,
      outputPath,
    };
  }
}
