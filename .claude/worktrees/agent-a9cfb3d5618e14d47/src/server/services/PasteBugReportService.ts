/**
 * Spec 025 C15 / FR-013 — auto bug-report for unresolvable paste content.
 *
 * When the paste-analyze flow cannot extract usable content (e.g. an image with
 * no text, or a corrupt binary blob), we never silently drop it: a sanitized
 * markdown bug report is written so the team can see the demand and the failure
 * mode. The user is told "logged for the team" — no raw data is leaked beyond a
 * short sanitized sample.
 */
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('paste-bug-report');

const BUG_REPORT_DIR = resolve(
  process.cwd(),
  'specs',
  'Project-Scope',
  '025-project-overview-builder',
  'bug-reports',
);

/** Strip anything that isn't plain printable ASCII and cap the sample length. */
function sanitizeSample(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E\n]/g, '·')
    .slice(0, 500)
    .trim();
}

/**
 * Write a paste-format-unsupported bug report. Returns the relative path of the
 * file written, or null if the write failed (logged; never throws to the
 * request path).
 */
export async function writePasteBugReport(opts: {
  reason: string;
  sample: string;
  draftid: string;
  companyid: string;
}): Promise<string | null> {
  const { reason, sample, draftid, companyid } = opts;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const hash = createHash('sha256')
    .update(sample)
    .digest('hex')
    .slice(0, 8);
  const filename = `${today}-paste-format-unsupported-${hash}.md`;
  const fullPath = resolve(BUG_REPORT_DIR, filename);

  const body = `# Paste format unsupported

- **Date**: ${new Date().toISOString()}
- **Draft**: ${draftid}
- **Company**: ${companyid}
- **Reason**: ${reason}

## Sanitized sample (first 500 printable chars)

\`\`\`
${sanitizeSample(sample)}
\`\`\`

_Auto-filed by the Project Overview paste-analyze flow (spec 025 C15)._
`;

  try {
    await mkdir(BUG_REPORT_DIR, { recursive: true });
    await writeFile(fullPath, body, 'utf-8');
    logger.info({ filename, reason, draftid }, 'Filed paste-format bug report');
    return `specs/Project-Scope/025-project-overview-builder/bug-reports/${filename}`;
  } catch (err) {
    logger.warn({ err, draftid }, 'Failed to write paste bug report');
    return null;
  }
}
