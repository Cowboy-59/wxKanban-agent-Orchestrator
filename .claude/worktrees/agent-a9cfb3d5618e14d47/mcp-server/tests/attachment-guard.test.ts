/**
 * [SCOPE 126 / T001] FR-016 — the content boundary is enforced by the SERVER.
 *
 * wxKanban tells customers that only documentation reaches it: no source, no
 * secrets. Before this, the only thing enforcing that was the Cockpit — and
 * `project_submit_feedback` is reachable by anything holding a token. These tests
 * pin the boundary against a caller that is NOT the Cockpit, which is the only
 * caller the old validation could not see.
 */
import { describe, it, expect } from 'vitest';
import {
  FeedbackAttachmentSchema,
  SubmitFeedbackInputSchema,
  ATTACHMENT_MAX_TOTAL_CHARS,
} from '../src/utils/schemas.js';
import {
  attachmentRejectionReason,
  isCredentialFilename,
  looksBinaryText,
  redactSecrets,
} from '../src/utils/attachment-guard.js';

const base = { bytes: 100, truncated: false, redactions: 0 };
const attach = (name: string, content: string) => ({ ...base, name, content });

describe('rejecting what masking cannot fix', () => {
  it('refuses a source file — the bypass the Cockpit allowlist could not close', () => {
    const result = FeedbackAttachmentSchema.safeParse(
      attach('server.ts', 'export function handler() { return 1; }'),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/not an accepted text\/log format/);
    }
  });

  it.each(['.env', '.env.production', '.npmrc', 'id_rsa'])(
    'refuses %s by filename, since it carries no extension to allowlist against',
    (name) => {
      expect(isCredentialFilename(name)).toBe(true);
      expect(FeedbackAttachmentSchema.safeParse(attach(name, 'KEY=value')).success).toBe(false);
    },
  );

  it('refuses binary content wearing a text extension', () => {
    const result = FeedbackAttachmentSchema.safeParse(attach('crash.log', 'PK\u0000\u0000binary'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/binary/);
  });

  it('accepts an ordinary log, so the sanctioned path is unchanged', () => {
    const result = FeedbackAttachmentSchema.safeParse(
      attach('run.log', 'INFO started\nERROR failed to connect\n'),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.redactions).toBe(0);
  });
});

describe('masking, independent of what the client claimed', () => {
  it('masks a credential the client said it had already scanned (redactions: 0)', () => {
    const result = FeedbackAttachmentSchema.safeParse(
      attach('app.log', 'starting up\nDB_PASSWORD=hunter2supersecret\ndone'),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.content).not.toContain('hunter2supersecret');
    expect(result.data.content).toContain('[redacted]');
    // The count is corrected upward: the client's 0 was wrong.
    expect(result.data.redactions).toBe(1);
  });

  it('masks a connection-string password while keeping the line readable', () => {
    const { text, redactions } = redactSecrets('postgres://app:s3cr3tp@db.host/wxkanban');
    expect(text).toBe('postgres://app:[redacted]@db.host/wxkanban');
    expect(redactions).toBe(1);
  });

  it('masks a bearer token and a JWT with no labelling key', () => {
    const { redactions } = redactSecrets(
      'Authorization: Bearer abcdefghijklmnop\ntok=eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM',
    );
    expect(redactions).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent — Cockpit-scrubbed content reports nothing further', () => {
    const once = redactSecrets('DB_PASSWORD=hunter2supersecret');
    const twice = redactSecrets(once.text);
    expect(twice.redactions).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it('does not count auth scheme names as secrets', () => {
    expect(redactSecrets('Authorization: Basic').redactions).toBe(0);
  });

  it('leaves prose alone', () => {
    const text = 'The build failed because the disk was full. No credentials here.';
    expect(redactSecrets(text)).toEqual({ text, redactions: 0 });
  });
});

describe('regressions — SCOPE-043 bounds still hold through the new transform', () => {
  it('still enforces the cross-attachment total', () => {
    const big = 'x'.repeat(ATTACHMENT_MAX_TOTAL_CHARS / 2 + 10);
    const result = SubmitFeedbackInputSchema.safeParse({
      projectId: '00000000-0000-4000-8000-000000000000',
      type: 'bug',
      title: 'too much',
      details: {},
      attachments: [attach('a.log', big), attach('b.log', big)],
    });
    expect(result.success).toBe(false);
  });

  it('still enforces the file count', () => {
    const result = SubmitFeedbackInputSchema.safeParse({
      projectId: '00000000-0000-4000-8000-000000000000',
      type: 'bug',
      title: 'too many',
      details: {},
      attachments: ['a', 'b', 'c', 'd'].map((n) => attach(`${n}.log`, 'ok')),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed submission end to end', () => {
    const result = SubmitFeedbackInputSchema.safeParse({
      projectId: '00000000-0000-4000-8000-000000000000',
      type: 'bug',
      title: 'crash on save',
      details: { whatHappened: 'it crashed' },
      attachments: [attach('crash.log', 'ERROR boom')],
    });
    expect(result.success).toBe(true);
  });
});

describe('scanning stays linear (the rule set runs on a 128KB field)', () => {
  it('scans a full-size attachment of unbroken alphanumerics in well under a second', () => {
    // The shape that made the URI rule backtrack quadratically: no ':' to anchor
    // on, so an unbounded scheme quantifier consumed the whole input from every
    // start position. Measured at 16.3s before the quantifiers were bounded.
    const worst = 'x'.repeat(131_000);
    const started = performance.now();
    redactSecrets(worst);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('stays fast on realistic log text too', () => {
    const log = 'INFO 2026-08-13 request completed in 12ms\n'.repeat(3_000);
    const started = performance.now();
    redactSecrets(log);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('binary detection', () => {
  it('flags a NUL byte', () => expect(looksBinaryText('a\u0000b')).toBe(true));
  it('flags a drift of replacement characters', () =>
    expect(looksBinaryText('\uFFFD'.repeat(50) + 'x'.repeat(100))).toBe(true));
  it('passes clean UTF-8 including accents and emoji', () =>
    expect(looksBinaryText('café — naïve — 🎉')).toBe(false));
  it('tolerates a single stray replacement char in a large log', () =>
    expect(looksBinaryText('x'.repeat(5000) + '\uFFFD')).toBe(false));
});

describe('rejection reasons are actionable', () => {
  it('tells the submitter what to do instead of attaching source', () => {
    const reason = attachmentRejectionReason(attach('handler.py', 'print(1)'));
    expect(reason).toMatch(/paste the relevant excerpt/i);
  });
});
