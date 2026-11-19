import { describe, it, expect } from 'vitest';
import { parseSpecMd, isSpecFolderName } from '../../core/orchestrator/spec-md-parser';

describe('parseSpecMd', () => {
  it('extracts spec number + title from "# Spec NNN: Title" H1', () => {
    const md = `# Spec 028: Hosted MCP Deployment\n\n## Overview\nbody\n`;
    const r = parseSpecMd(md);
    expect(r.meta.specNumber).toBe('028');
    expect(r.meta.title).toBe('Hosted MCP Deployment');
  });

  it('accepts em-dash separator in H1', () => {
    const md = `# Spec 019 — Agent Orchestrator Kit\n`;
    const r = parseSpecMd(md);
    expect(r.meta.specNumber).toBe('019');
    expect(r.meta.title).toBe('Agent Orchestrator Kit');
  });

  it('falls back to generic H1 when no spec-prefix matches', () => {
    const md = `# Free-form Title\n\nbody\n`;
    const r = parseSpecMd(md);
    expect(r.meta.specNumber).toBeUndefined();
    expect(r.meta.title).toBe('Free-form Title');
  });

  it('extracts bold-key metadata lines anywhere in the body', () => {
    const md =
      `# Spec 028: Hosted MCP Deployment\n\n` +
      `**Spec Number**: 028\n` +
      `**Status**: \`approved\`\n` +
      `**Created**: 2026-05-13\n` +
      `**Depends On**: 019-agent-orchestrator-kit\n`;
    const r = parseSpecMd(md);
    expect(r.meta.specNumber).toBe('028');
    expect(r.meta.status).toBe('approved'); // strips surrounding backticks
    expect(r.meta.created).toBe('2026-05-13');
    expect(r.meta.dependsOn).toBe('019-agent-orchestrator-kit');
  });

  it('preserves the H1-extracted specNumber when a meta line agrees', () => {
    const md = `# Spec 014: x\n\n**Spec Number**: 014\n`;
    const r = parseSpecMd(md);
    expect(r.meta.specNumber).toBe('014');
  });

  it('returns the full body unchanged', () => {
    const md = `# Spec 001: x\n\nhello\n\n## Section\ntext\n`;
    const r = parseSpecMd(md);
    expect(r.body).toBe(md);
  });

  it('collects ## headings for sanity checks', () => {
    const md = `# Spec 001: x\n## A\n## B\n### C\n## D\n`;
    const r = parseSpecMd(md);
    expect(r.headings).toEqual(['A', 'B', 'D']);
  });
});

describe('isSpecFolderName', () => {
  it.each([
    ['001-multi-platform-task', true],
    ['019-agent-orchestrator-kit', true],
    ['028-HostedMCPDeployment', true],
    ['008-007-project-layout', true], // double-prefixed legacy form
    ['004-Team Assigments', false],   // space in name disqualifies
    ['Project-Scope', false],
    ['main', false],
    ['overvirew.md', false],
    ['HIPAA_SDLC_Compliance_Rules.md', false],
    ['000', false],                   // no slug
    ['', false],
  ])('classifies %s as %s', (name, expected) => {
    expect(isSpecFolderName(name)).toBe(expected);
  });
});
