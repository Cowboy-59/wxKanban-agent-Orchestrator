/**
 * SCOPE-133 / T019 — the session_start gate, and the fabrication it must not reintroduce.
 *
 * project.session_start is the tool SCOPE-124/T021 gutted for inventing projectType
 * 'CONSUMER', governance 1.2.0 and sessionReady true. SCOPE-133 rebuilds it. Reopening
 * that exact handler is the whole risk here, and `repoReported` is the live hazard: a
 * client claim this tool deliberately echoes back.
 *
 * Guarded structurally, and that is stated rather than dressed up as behaviour — the
 * handler sits inside a 5,000-line switch needing a database, an auth scope and a
 * transport to reach. What CAN be pinned without any of those is that the fabricated
 * literals are absent from the code that executes, and that the gate's refusal paths
 * exist. That is precisely what regressed before, twice, as placeholders outlived the
 * intention to replace them.
 *
 * Comments are stripped before asserting, per T017 and T021: the comments explaining
 * each removal necessarily quote the thing removed, and three of T017's guards failed
 * on their own documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// [SCOPE 133 / T019] BEGIN — session_start gate + anti-fabrication guards
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

/** The `case 'project.session_start'` block only, so a guard cannot pass on a sibling tool. */
function sessionStartCase(source: string): string {
  const start = source.indexOf("case 'project.session_start':");
  if (start === -1) throw new Error("case 'project.session_start' not found");
  const next = source.indexOf("\n      case 'project.", start + 40);
  return source.slice(start, next === -1 ? source.length : next);
}

const SERVER = join(__dirname, '..', 'src', 'server.ts');
const SCHEMAS = join(__dirname, '..', 'src', 'utils', 'schemas.ts');
const INDEX_HTTP = join(__dirname, '..', 'src', 'index-http.ts');
const DB_SCHEMA = join(__dirname, '..', 'src', 'db', 'schema.ts');

const serverSrc = executable(readFileSync(SERVER, 'utf8'));
const handler = sessionStartCase(serverSrc);

describe('SCOPE-133 / T019 — session_start is agent-gated', () => {
  it('resolves a project for the caller (T002)', () => {
    // Absent from PROJECT_SCOPED_TOOLS it resolved no project at all, so it could not
    // have answered a project question even if it had tried.
    const set = serverSrc.slice(
      serverSrc.indexOf('const PROJECT_SCOPED_TOOLS'),
      serverSrc.indexOf(']);', serverSrc.indexOf('const PROJECT_SCOPED_TOOLS')),
    );
    expect(set).toContain("'project.session_start'");
  });

  it('reads identity from the token, never from the arguments (T004)', () => {
    expect(handler).toContain('scoped.scope.tokenId');
    expect(handler).toContain('mcpapitokens.clientbinding');
    // The expected binding is rebuilt from the STORED hash; the raw token is never needed.
    expect(handler).toContain('tokenRow.hash');
  });

  it('refuses a caller with no token and one with no agent name (T004)', () => {
    expect(handler).toContain('no_token');
    expect(handler).toContain('no_agent_name');
  });

  it('refuses an unbound token rather than letting it through (T004)', () => {
    expect(handler).toContain('unbound_token');
  });

  it('names which half of the binding failed (T005)', () => {
    expect(handler).toContain('binding_name_mismatch');
    expect(handler).toContain('binding_token_mismatch');
  });

  it('never returns the stored binding or the token hash in a refusal (T005)', () => {
    const refusal = handler.slice(handler.indexOf('const refuse'), handler.indexOf('const tokenId'));
    expect(refusal).not.toContain('tokenRow.binding');
    expect(refusal).not.toContain('tokenRow.hash');
  });
});

describe('SCOPE-133 / T019 — the session id is the server’s, not the caller’s', () => {
  it('mints the session id server-side (T007)', () => {
    expect(handler).toContain('const sessionId = randomUUID()');
  });

  it('records a carried session id as a label without validating it (T010)', () => {
    expect(handler).toContain('carriedSessionId');
    // A carried id is stored and echoed; it must never become the session identity.
    expect(handler).not.toContain('const sessionId = input.sessionId');
  });

  it('correlates the event by metadata.sessionId with no schema change (T009)', () => {
    expect(handler).toContain("type: 'agent_session_start'");
    expect(handler).toContain('sessionId,');
  });
});

describe('SCOPE-133 / T019 — nothing is reported that was not measured', () => {
  it('does not reintroduce the T021 fabrications', () => {
    // The four literals that made this tool a cautionary tale.
    expect(handler).not.toContain("'CONSUMER'");
    expect(handler).not.toContain("upToDate");
    expect(handler).not.toContain('sessionReady: true');
    expect(handler).not.toContain("projectType: '");
  });

  it('marks the reported repo as unverified (T013)', () => {
    expect(handler).toContain('repoReported');
    // The flag is what stops a reader taking a client claim for a checked fact.
    expect(handler).toContain('repoVerified: false');
  });

  it('states what it did not check rather than answering it (T015)', () => {
    expect(handler).toContain('notChecked');
    expect(handler).toContain('governance: null');
    expect(handler).toContain('todos: null');
  });

  it('degrades honestly when the status block cannot be read (T014)', () => {
    // An empty summary would read as "nothing outstanding"; statusError says otherwise.
    expect(handler).toContain('statusError');
  });

  it('builds status through the existing cockpit-summary builder, not a second path (T014)', () => {
    expect(handler).toContain('buildCockpitSummary(');
  });
});

describe('SCOPE-133 / T019 — the literals that were standing in for measurements', () => {
  it('reads currentPhase from the column instead of a hardcoded null (T016)', () => {
    const loader = serverSrc.slice(
      serverSrc.indexOf('async function loadProjectSummary'),
      serverSrc.indexOf('\nasync function', serverSrc.indexOf('async function loadProjectSummary') + 10),
    );
    expect(loader).toContain('project.currentphase');
    expect(loader).not.toContain('currentPhase: null');
  });

  it('declares currentphase in the mirror, or the read above is undefined (T016)', () => {
    const mirror = executable(readFileSync(DB_SCHEMA, 'utf8'));
    expect(mirror).toContain("currentphase: varchar('currentphase'");
  });

  it('declares clientbinding in the mirror (T001)', () => {
    const mirror = executable(readFileSync(DB_SCHEMA, 'utf8'));
    expect(mirror).toContain("clientbinding: varchar('clientbinding'");
  });

  it('carries no frozen version literal on any surface (T017)', () => {
    // Four sites reported 0.1.0 while version.ts said 0.1.1 — including the initialize
    // handshake every client reads, and /health, which is how a deploy is checked.
    expect(serverSrc).not.toContain("'0.1.0'");
    expect(executable(readFileSync(INDEX_HTTP, 'utf8'))).not.toContain("'0.1.0'");
    expect(serverSrc).toContain('const SERVER_INFO = { name: \'mcp-project-hub\', version: WXKANBAN_VERSION }');
  });
});

describe('SCOPE-133 / T019 — the event type is declared once', () => {
  it('adds agent_session_start to the zod enum (T008)', () => {
    const schemas = executable(readFileSync(SCHEMAS, 'utf8'));
    expect(schemas).toContain("'agent_session_start'");
  });

  it('leaves the advertised JSON-Schema enum derived, never hand-copied (T008)', () => {
    // It has drifted twice from hand-copying; the contract test guards the pairing.
    const advertised = serverSrc.slice(
      serverSrc.indexOf("name: 'project.capture_event'"),
      serverSrc.indexOf("name: 'project.capture_event'") + 2000,
    );
    expect(advertised).toContain('ProjectEventTypeSchema');
  });
});

describe('SCOPE-133 / T019 — incumbents keep working', () => {
  it('gates on clientbinding ONLY in declared agent-only tools (T006/FR-005)', () => {
    // FR-005 protects the 356 unbound kit and Cockpit tokens: no EXISTING tool may start
    // requiring a binding. New agent-only tools may, by design.
    //
    // This began as a bare count of 1 and tripped when SCOPE-134 added record_override —
    // correctly, but for the wrong reason. Bumping the number would let it drift silently,
    // so the invariant is now explicit: every gating site must sit inside a tool named
    // here. Adding a third becomes a deliberate edit to this list; gating an EXISTING
    // tool still fails, which is what FR-005 actually cares about.
    const AGENT_ONLY = ['project.session_start', 'project.record_override'];

    const sites = [...serverSrc.matchAll(/mcpapitokens\.clientbinding/g)].map((m) => m.index ?? 0);
    expect(sites.length).toBeGreaterThan(0);

    for (const at of sites) {
      // Walk back to the nearest `case 'project.x':` and check it is declared agent-only.
      const before = serverSrc.slice(0, at);
      const caseAt = before.lastIndexOf("case 'project.");
      const owner = serverSrc.slice(caseAt, caseAt + 60).match(/case '(project\.[a-z_]+)'/)?.[1];
      expect(AGENT_ONLY, `clientbinding gating found in ${owner ?? 'unknown tool'}`).toContain(owner);
    }
  });
});
// [SCOPE 133 / T019] END
