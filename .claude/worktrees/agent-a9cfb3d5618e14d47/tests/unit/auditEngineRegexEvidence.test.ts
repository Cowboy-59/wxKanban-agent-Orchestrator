/**
 * Audit Engine — regex evidence evaluation
 *
 * SPEC-112 / FR-006 — "The audit engine never reports an unearned pass."
 *
 * Regression cover for the false-pass defect that shipped in
 * AuditEngineService.checkRegexPattern: it scanned the whole `src` tree and
 * returned `pass` on the FIRST match anywhere — a comment, a generated .d.ts,
 * or an unrelated module all counted — and recorded no file, line, or snippet
 * to back the pass up. An audit report that asserts a control is satisfied
 * without traceable evidence is worse than one that reports a gap, because
 * customers make decisions on it.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRegexEvidence } from '../../src/server/services/AuditEngineService.js';

const file = (path: string, content: string) => ({ path, content });

describe('evaluateRegexEvidence', () => {
  describe('the false-pass cases that shipped', () => {
    it('does NOT treat a line-comment mention as evidence', () => {
      const result = evaluateRegexEvidence('bcrypt', [
        file('src/server/lib/password.ts', '// TODO: switch this to bcrypt one day\nexport const hash = () => plaintext;'),
      ]);

      expect(result.verdict).toBe('comment_only');
      expect(result.verdict).not.toBe('evidence');
    });

    it('does NOT treat a block-comment mention as evidence', () => {
      const result = evaluateRegexEvidence('AES-256-GCM', [
        file('src/server/lib/crypto.ts', '/**\n * We should use AES-256-GCM here.\n */\nexport const encrypt = (s: string) => s;'),
      ]);

      expect(result.verdict).toBe('comment_only');
    });

    it('does NOT treat a generated .d.ts declaration as evidence', () => {
      const result = evaluateRegexEvidence('requireAdmin', [
        file('src/server/routes/admin.d.ts', 'export declare function requireAdmin(): void;'),
      ]);

      expect(result.verdict).not.toBe('evidence');
    });

    it('does NOT treat a built dist copy as evidence', () => {
      const result = evaluateRegexEvidence('helmet', [
        file('src/server/dist/app.js', 'app.use(helmet());'),
      ]);

      expect(result.verdict).not.toBe('evidence');
    });
  });

  describe('a pass must carry traceable evidence', () => {
    it('returns evidence with file, line and snippet for a real code match', () => {
      const result = evaluateRegexEvidence('bcrypt', [
        file('src/server/lib/password.ts', 'import bcrypt from "bcrypt";\n\nexport const hash = (p: string) => bcrypt.hashSync(p, 12);'),
      ]);

      expect(result.verdict).toBe('evidence');
      if (result.verdict !== 'evidence') return;
      expect(result.evidence.filepath).toBe('src/server/lib/password.ts');
      expect(result.evidence.lineNumber).toBe(1);
      expect(result.evidence.codeSnippet).toContain('bcrypt');
    });

    it('reports the line number of the first real match, not of a comment above it', () => {
      const result = evaluateRegexEvidence('helmet', [
        file('src/server/app.ts', '// helmet is configured below\nimport express from "express";\napp.use(helmet());'),
      ]);

      expect(result.verdict).toBe('evidence');
      if (result.verdict !== 'evidence') return;
      expect(result.evidence.lineNumber).toBe(3);
    });

    it('prefers real code over a comment hit in an earlier file', () => {
      const result = evaluateRegexEvidence('rateLimit', [
        file('src/server/notes.ts', '// rateLimit should go here'),
        file('src/server/middleware/rate-limit.ts', 'export const rateLimit = build();'),
      ]);

      expect(result.verdict).toBe('evidence');
      if (result.verdict !== 'evidence') return;
      expect(result.evidence.filepath).toBe('src/server/middleware/rate-limit.ts');
    });
  });

  describe('absence and unverifiability are distinguished', () => {
    it('returns absent when the pattern appears nowhere', () => {
      const result = evaluateRegexEvidence('mfaEnabled', [
        file('src/server/lib/password.ts', 'export const hash = () => 1;'),
      ]);

      expect(result.verdict).toBe('absent');
    });

    it('returns unverifiable rather than absent when nothing could be scanned', () => {
      const result = evaluateRegexEvidence('anything', []);

      expect(result.verdict).toBe('unverifiable');
      if (result.verdict !== 'unverifiable') return;
      expect(result.reason).toMatch(/no applicable files/i);
    });

    it('returns unverifiable for an invalid regex instead of silently failing', () => {
      const result = evaluateRegexEvidence('([unclosed', [
        file('src/server/app.ts', 'const x = 1;'),
      ]);

      expect(result.verdict).toBe('unverifiable');
    });

    it('never returns evidence for an empty pattern', () => {
      const result = evaluateRegexEvidence('', [
        file('src/server/app.ts', 'const x = 1;'),
      ]);

      expect(result.verdict).not.toBe('evidence');
    });
  });

  it('counts only files it actually scanned', () => {
    const result = evaluateRegexEvidence('express', [
      file('src/server/app.ts', 'import express from "express";'),
      file('src/server/app.d.ts', 'declare const express: unknown;'),
      file('src/server/dist/app.js', 'require("express");'),
    ]);

    // .d.ts and dist/ are excluded from the scan set entirely
    expect(result.filesScanned).toBe(1);
  });

  // SPEC-112 Amendment A / T011. Comment, .d.ts and dist hits were the false-pass
  // classes the FR-006 fix removed. Authoring the SOC 2 corpus surfaced two more that
  // live in ordinary, scannable source — the pattern matches a line that mentions the
  // control without implementing it. These are properties of the PATTERN, not of the
  // engine, so the cover here is that a naive pattern really does produce the wrong
  // verdict, which is why the shipped corpus uses implementation identifiers instead.
  describe('patterns that name a control rather than evidence it', () => {
    it('a keyword list inside a regex literal reads as evidence — why the MFA check cannot match the acronym', () => {
      const naive = evaluateRegexEvidence('\\b(mfa|totp|two[-_]?factor)\\b', [
        file(
          'src/server/services/AuditTaskService.ts',
          'if (/access|authentication|authorization|mfa|login/i.test(taskText)) {',
        ),
      ]);
      // The acronym appears in real, non-comment code — so the engine is right to call
      // it evidence. The pattern is what is wrong.
      expect(naive.verdict).toBe('evidence');

      const shipped = evaluateRegexEvidence(
        '(otplib|speakeasy|authenticator\\.(generate|verify)|totpsecret|mfasecret|mfaenabled)',
        [
          file(
            'src/server/services/AuditTaskService.ts',
            'if (/access|authentication|authorization|mfa|login/i.test(taskText)) {',
          ),
        ],
      );
      expect(shipped.verdict).toBe('absent');
    });

    it('a translated product claim is not evidence — why the encryption check matches the crypto call', () => {
      // This is the same de-DE string that first exposed the problem. It is now excluded
      // from the scan set entirely (see the locale-bundle case below), so the naive
      // pattern can no longer reach it. Kept because it is the origin of that exclusion:
      // a product claim in six languages is not proof of a cipher.
      const marketing = file(
        'src/client/i18n/locales/de-DE.ts',
        'description: "Konform mit SOC 2, HIPAA und DSGVO, mit AES-256-GCM-Verschlusselung",',
      );
      expect(evaluateRegexEvidence('aes-256-gcm', [marketing]).verdict).toBe('unverifiable');

      // A file that is scannable but merely NAMES the algorithm still must not pass.
      const mention = file('src/server/config/labels.ts', 'export const CIPHER_LABEL = "aes-256-gcm";');
      expect(evaluateRegexEvidence('create(Cipher|Decipher)iv', [mention]).verdict).toBe('absent');

      const real = evaluateRegexEvidence('create(Cipher|Decipher)iv', [
        file('src/server/lib/crypto.ts', 'const cipher = crypto.createCipheriv(ALGORITHM, key, iv);'),
      ]);
      expect(real.verdict).toBe('evidence');
    });

    it('does NOT treat a translation bundle as evidence — it is product prose in a .ts file', () => {
      // SPEC-113 FR-011. Three separate false passes came from here while the framework
      // catalogs were authored: the locale bundles describe the product's security
      // properties in six languages, and a claim translated into German was reported as
      // evidence, with a file and line, that the control was implemented.
      const locale = file(
        'src/client/i18n/locales/de-DE.ts',
        'description: "bcrypt-Hashing mit JWT-Tokens und Rotation der Refresh-Tokens",',
      );
      const impl = file('src/server/lib/password.ts', 'const hashed = await bcrypt.hash(password, ROUNDS);');

      expect(evaluateRegexEvidence('bcrypt', [locale]).verdict).toBe('unverifiable');
      expect(evaluateRegexEvidence('bcrypt', [locale]).filesScanned).toBe(0);

      // The real implementation still evidences it, and is what gets reported when both
      // are in the scan set.
      const both = evaluateRegexEvidence('bcrypt\\.(hash|compare)', [locale, impl]);
      expect(both.verdict).toBe('evidence');
      if (both.verdict === 'evidence') {
        expect(both.evidence.filepath).toBe('src/server/lib/password.ts');
      }
    });

    it('committed tsc output beside a source file can supply the evidence instead of the source', () => {
      // src/lib/validation.js sits next to validation.ts in this tree, and the default
      // file set (.ts, .tsx, .js) reaches both. Authored checks narrow to .ts/.tsx.
      const compiled = file('src/lib/validation.js', 'exports.schema = z.object({ id: z.string() });');
      expect(evaluateRegexEvidence('z\\.object\\(', [compiled]).verdict).toBe('evidence');

      const typescriptOnly = [compiled].filter((f) => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
      expect(evaluateRegexEvidence('z\\.object\\(', typescriptOnly).verdict).toBe('unverifiable');
    });
  });
});
