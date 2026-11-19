// Spec 029 / T011 — heading rewriter tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { rewriteContent, rewriteHeadings } from '../../core/orchestrator/spec-heading-rewriter';

describe('rewriteContent — bold-inline to heading', () => {
  it('rewrites `**Business Problem** body` into `## Business Problem` + body', () => {
    const before = '## Overview\n\nIntro text.\n\n**Business Problem** Customers lose money.\n';
    const { newContent, rewroteSections } = rewriteContent(before, ['business_problem']);
    expect(rewroteSections).toEqual(['business_problem']);
    expect(newContent).toContain('## Business Problem');
    expect(newContent).toContain('Customers lose money.');
    expect(newContent).not.toContain('**Business Problem**');
  });

  it('rewrites `**Business Problem:** body` (colon form) into heading', () => {
    const before = '## Overview\n\n**Business Problem:** Customers lose money.\n';
    const { newContent } = rewriteContent(before, ['business_problem']);
    expect(newContent).toContain('## Business Problem');
    expect(newContent).toContain('Customers lose money.');
  });

  it('does not touch bold labels inside fenced code blocks', () => {
    const before = '## Overview\n\n```\n**Business Problem** placeholder example\n```\n';
    const { newContent, rewroteSections } = rewriteContent(before, ['business_problem']);
    expect(rewroteSections).toEqual([]);
    expect(newContent).toContain('**Business Problem** placeholder example');
  });

  it('handles multiple heading-shape sections in one pass', () => {
    const before =
      '## Overview\n\n' +
      '**Business Problem** A.\n' +
      '**Scope Boundary** B.\n' +
      '**Out of Scope** C.\n';
    const { newContent, rewroteSections } = rewriteContent(before, [
      'business_problem',
      'scope_boundary',
      'out_of_scope',
    ]);
    expect(rewroteSections.sort()).toEqual(['business_problem', 'out_of_scope', 'scope_boundary'].sort());
    expect(newContent).toContain('## Business Problem');
    expect(newContent).toContain('## Scope Boundary');
    expect(newContent).toContain('## Out of Scope');
  });
});

describe('rewriteContent — Actors bold-em-dash to Primary:/Secondary: lines', () => {
  it('rewrites `**Primary actor — Name**` and `**Secondary actor — Name**`', () => {
    const before =
      '## Actors\n\n' +
      '**Primary actor — Kit operator**\n' +
      '**Secondary actor — MCP server**\n';
    const { newContent, rewroteSections } = rewriteContent(before, ['actors']);
    expect(rewroteSections).toEqual(['actors']);
    expect(newContent).toContain('- Primary: Kit operator');
    expect(newContent).toContain('- Secondary: MCP server');
    expect(newContent).not.toMatch(/\*\*Primary actor/);
    expect(newContent).not.toMatch(/\*\*Secondary actor/);
  });

  it('rewrites `**Primary** Name` plain form', () => {
    const before = '## Actors\n\n**Primary** Kit operator\n**Secondary** MCP server\n';
    const { newContent } = rewriteContent(before, ['actors']);
    expect(newContent).toContain('- Primary: Kit operator');
    expect(newContent).toContain('- Secondary: MCP server');
  });

  it('does not rewrite Actors content inside a code fence', () => {
    const before = '## Actors\n\n```\n**Primary actor — example**\n```\n';
    const { rewroteSections } = rewriteContent(before, ['actors']);
    expect(rewroteSections).toEqual([]);
  });
});

describe('rewriteHeadings — file-system + .bak naming', () => {
  let workdir = '';
  beforeEach(() => {
    workdir = join(tmpdir(), `rewriter-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(workdir, { recursive: true });
  });
  afterEach(() => {
    if (workdir && existsSync(workdir)) {
      rmSync(workdir, { recursive: true, force: true });
    }
  });

  it('writes .bak file with Windows-safe timestamp before rewriting', () => {
    const path = join(workdir, 'spec.md');
    writeFileSync(path, '## Overview\n\n**Business Problem** A.\n');
    const fixedNow = new Date('2026-05-25T13:45:46.574Z');
    const result = rewriteHeadings(path, ['business_problem'], fixedNow);
    // The bak FILENAME (not the full path — drive letters have colons
    // on Windows) must NOT contain `:`.
    const basename = result.bakPath.split(/[\\/]/).pop() ?? '';
    expect(basename).not.toMatch(/:/);
    expect(result.bakPath).toMatch(/spec\.md\.bak-2026-05-25T13-45-46-574Z$/);
    expect(existsSync(result.bakPath)).toBe(true);
    const bakContent = readFileSync(result.bakPath, 'utf-8');
    expect(bakContent).toContain('**Business Problem**');
    const newContent = readFileSync(path, 'utf-8');
    expect(newContent).toContain('## Business Problem');
  });

  it('does NOT modify the file if no sections actually rewrote', () => {
    const path = join(workdir, 'spec.md');
    const original = '## Overview\n\nplain text, no bold labels\n';
    writeFileSync(path, original);
    const result = rewriteHeadings(path, ['business_problem']);
    expect(result.rewroteSections).toEqual([]);
    // .bak is still created (per spec — always back up before any attempt)
    expect(existsSync(result.bakPath)).toBe(true);
    // But the original file is unchanged
    expect(readFileSync(path, 'utf-8')).toBe(original);
  });
});
