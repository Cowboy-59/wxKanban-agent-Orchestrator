/**
 * SCOPE-124 / T021 — the tools that answered for work they did not do.
 *
 * T020 corrected the response field report 7dfc7c13 named. Sweeping the rest of the surface found
 * six more: a project id for a project that was never created, an analysis that was never run, a
 * governance version that was never checked, a kit regeneration that was never queued, and an
 * implement description promising a tasks.md read the handler deliberately does not perform.
 *
 * These are guarded structurally, and that is stated rather than dressed up as behaviour: the
 * handlers live inside a 5,000-line switch that needs a database, an auth scope and a transport to
 * reach. What can be pinned without any of that is that the fabricated literals are gone from the
 * code that executes — which is exactly what regressed here, twice, as placeholders outlived the
 * intention to replace them.
 *
 * Comments are stripped before asserting, per T017: the comment explaining each removal necessarily
 * quotes the thing removed, and three of T017's guards failed on their own documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// [SCOPE 124 / T021] BEGIN — the other tools that answer for work they did not do
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}
// [SCOPE 124 / T021] END

/** The body of one top-level `export async function`, so a guard cannot pass on a sibling. */
// [SCOPE 124 / T021] BEGIN — the other tools that answer for work they did not do
function functionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`declaration not found: ${declaration}`);
  const next = source.indexOf('\nexport ', start + declaration.length);
  return source.slice(start, next === -1 ? source.length : next);
}
// [SCOPE 124 / T021] END

const SERVER = executable(readFileSync(join(__dirname, '..', 'src', 'server.ts'), 'utf8'));
const PROJECT_KIT = executable(readFileSync(join(__dirname, '..', 'src', 'utils', 'project-kit.ts'), 'utf8'));

describe('SCOPE-124 T021 — import_project does not invent a project', () => {
  const body = functionBody(PROJECT_KIT, 'export async function importProject(');

  it('returns no id for a record it never created', () => {
    expect(body).not.toContain('randomUUID()');
    expect(body).not.toContain("status: 'active'");
  });

  it('says the import did not happen', () => {
    expect(body).toContain("status: 'not_implemented'");
    expect(body).toContain('success: false');
  });
});

describe('SCOPE-124 T021 — regenerate_kit neither claims nor parks', () => {
  const body = functionBody(PROJECT_KIT, 'export async function regenerateKit(');

  it('does not report a regeneration it never queued', () => {
    expect(body).not.toContain('Kit regeneration started');
  });

  it('leaves the kit record alone rather than setting a state nothing clears', () => {
    expect(body).not.toContain("status: 'generating'");
    expect(body).not.toContain('.update(');
  });
});

describe('SCOPE-124 T021 — analyze reports no analysis it did not run', () => {
  it('has no unreachable spec-artifact reader left to resurrect', () => {
    expect(SERVER).not.toContain('function analyzeSpecArtifacts');
    expect(SERVER).not.toContain('analyzeSpecArtifacts(');
  });

  it('does not claim completion', () => {
    expect(SERVER).not.toContain('wxAI-analyze completed');
    expect(SERVER).toContain("status: 'unavailable'");
  });
});

describe('SCOPE-124 T021 — session_start states nothing it did not check', () => {
  it('carries no invented governance version or project type', () => {
    expect(SERVER).not.toContain('wxAI-session-start completed');
    expect(SERVER).not.toContain("version: '1.2.0'");
    expect(SERVER).not.toContain("projectType: 'CONSUMER'");
  });

  // SUPERSEDED BY SCOPE-133. T021's remedy was to gut this tool to a flat
  // `not_implemented` refusal, and this test pinned that refusal. SCOPE-133 rebuilds
  // session_start as a real agent-gated tool, so the refusal literals are gone by
  // intent — the assertion below would now fail for the right reason.
  //
  // The RULE T021 established is not relaxed, it is tightened: instead of refusing
  // wholesale, the tool now measures what it can and names what it cannot. That is a
  // stronger guarantee than "answers nothing", and it is what this test now pins.
  // Fuller coverage lives in scope-133-t019-session-start.test.ts.
  it('states what it did not check instead of answering it', () => {
    expect(SERVER).toContain('notChecked');
    expect(SERVER).toContain('governance: null');
    expect(SERVER).toContain('todos: null');
    // The reported repo is the live fabrication risk in the rebuilt tool: a client
    // claim it deliberately echoes. It must never be presented as verified.
    expect(SERVER).toContain('repoVerified: false');
  });
});

describe('SCOPE-124 T021 — implement describes the four steps it runs', () => {
  it('no longer promises a tasks.md read or checklist validation', () => {
    expect(SERVER).not.toContain('Run implementation plan from tasks.md');
    expect(SERVER).not.toContain('wxAI-implement completed');
  });

  it('lists no phase that does not run', () => {
    expect(SERVER).not.toContain("'Phase 1: Setup & Prerequisites'");
    expect(SERVER).not.toContain("'Phase 5: Completion Validation'");
    expect(SERVER).toContain("'Task sync from projecttasks'");
  });
});

describe('SCOPE-124 T021 — kit_status says what its status means', () => {
  it('keeps the value the installers depend on, and explains it', () => {
    expect(SERVER).toContain("status: 'ready'");
    expect(SERVER).toContain('statusMeaning:');
  });
});

describe('SCOPE-124 T020 — buildscope, guarded here alongside its siblings', () => {
  it('reports a draft rather than a creation', () => {
    const body = functionBody(PROJECT_KIT, 'export async function buildScope(');
    expect(body).toContain("'draft_updated' : 'drafted'");
    expect(body).toContain('persisted: false');
    expect(body).not.toContain('created and ready for spec generation');
  });
});
