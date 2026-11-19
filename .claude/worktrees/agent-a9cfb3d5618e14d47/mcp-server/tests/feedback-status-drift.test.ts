// [SCOPE 043 / FR-020] The MCP server cannot import from src/ (separate deployment),
// so the app's vocabulary is read off disk and compared. This is the standing cost
// of re-implementing the transition; without it the copies drift silently.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEEDBACK_STATUSES, TRIAGED_MESSAGE, buildStatusMessage } from '../src/utils/feedback-status.js';

const APP_SERVICES_DIR = join(
  process.cwd(), '..', 'src', 'server', 'services',
);
const APP_SERVICE = join(APP_SERVICES_DIR, 'FeedbackTriageService.ts');

describe('status vocabulary parity with the app', () => {
  it('matches FeedbackTriageService.FEEDBACK_STATUSES exactly', () => {
    // Kit consumers ship mcp-server without the app tree; skip rather than fail.
    if (!existsSync(APP_SERVICES_DIR)) {
      expect(true).toBe(true);
      return;
    }

    // If the services directory exists but the file doesn't, the file was moved/renamed.
    expect(existsSync(APP_SERVICE), 'FeedbackTriageService.ts was moved or renamed - update the path in this drift guard').toBe(true);

    const src = readFileSync(APP_SERVICE, 'utf8');
    const block = /export const FEEDBACK_STATUSES = \[([\s\S]*?)\] as const;/.exec(src);
    expect(block, 'FEEDBACK_STATUSES not found - the app file was restructured').not.toBeNull();

    const appStatuses = [...block![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(appStatuses.length).toBeGreaterThan(0);
    expect(appStatuses).toEqual([...FEEDBACK_STATUSES]);
  });
});

// [SCOPE 148 / T005] BEGIN — the triaged wording is one sentence on both surfaces (FR-009)
describe('triaged message parity with the app', () => {
  const APP_NOTIFY = join(APP_SERVICES_DIR, 'FeedbackNotificationService.ts');

  it('FeedbackNotificationService.TRIAGED_MESSAGE equals the MCP copy, and both builders use it', () => {
    if (!existsSync(APP_SERVICES_DIR)) {
      expect(true).toBe(true);
      return;
    }
    expect(existsSync(APP_NOTIFY), 'FeedbackNotificationService.ts was moved or renamed - update this drift guard').toBe(true);

    const src = readFileSync(APP_NOTIFY, 'utf8');
    const m = /export const TRIAGED_MESSAGE =\s*"([^"]+)";/.exec(src);
    expect(m, 'TRIAGED_MESSAGE not found in the app copy').not.toBeNull();
    expect(m![1]).toBe(TRIAGED_MESSAGE);
    // Both open with the report's lead-in, then the shared sentence.
    expect(src).toMatch(/case "triaged":\s*return `Your report "\$\{row\.title\}" \(\$\{ref\}\): \$\{TRIAGED_MESSAGE\}`;/);

    const row = { id: 'abcdef12-0000', title: 't', status: 'triaged', reopenedAt: null, clarificationQuestion: null, declineReason: null };
    expect(buildStatusMessage(row)).toBe(`Your report "t" (abcdef12): ${TRIAGED_MESSAGE}`);
  });
});
// [SCOPE 148 / T005] END
