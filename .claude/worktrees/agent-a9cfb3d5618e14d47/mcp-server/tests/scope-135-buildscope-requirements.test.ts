/**
 * SPEC-135 — buildscope carries the author's real requirements (with Amendment A).
 *
 * Each describe block reproduces a customer field report from the 2026-10-04 buildscope sweep and
 * asserts the fixed behavior: 523f65ed / a02e6ec5 / e0eddf34 / 84f98f9c (boilerplate FRs and
 * placeholder sections), 56b8f6d2 (edit merged into the stored copy), 7874b04b (score 100 beside
 * unticked "required" boxes), c4e40bb5 (number collision with an unpushed local spec), 84f98f9c /
 * a17783bb (accented slugs), 17b7ae98 (templateOnly misreported).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let specRows: Array<Record<string, unknown>> = [];
// [SCOPE 135 / T019] stored scope documents (projectdocuments, doctype 'scope'), served separately.
let scopeDocRows: Array<Record<string, unknown>> = [];

vi.mock('../src/db/connection.js', () => ({
  db: {
    select: () => ({
      from: (table: { __table?: string }) => ({
        where: () => {
          const rows = table?.__table === 'projectdocuments' ? scopeDocRows : specRows;
          const result = Promise.resolve(rows) as Promise<unknown> & { limit?: unknown; orderBy?: unknown };
          result.limit = () => Promise.resolve(rows);
          result.orderBy = () => ({ limit: () => Promise.resolve(rows) });
          return result;
        },
      }),
    }),
  },
  pool: {},
}));
vi.mock('../src/db/schema.js', () => ({
  projectspecifications: {
    projectId: 'projectid',
    specNumber: 'specnumber',
    title: 'title',
    content: 'content',
    updatedAt: 'updatedat',
  },
  projectdocuments: {
    __table: 'projectdocuments',
    projectId: 'projectid',
    doctype: 'doctype',
    title: 'title',
    content: 'content',
    updatedAt: 'updatedat',
  },
}));
vi.mock('../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import {
  buildScope,
  generateShortName,
  deriveScopeTitle,
  validateScopeContent,
  createSpecsPreflight,
} from '../src/utils/project-kit.js';
import { BuildScopeInputSchema } from '../src/utils/schemas.js';
import { scopeSyncHash, withScopeSyncMarker } from '@wxkanban/preflight';

const PROJECT = '2923c8d7-418f-4db5-85bb-817efdc72f1a';
const BOILERPLATE_TITLES = [
  'Primary workflow support',
  'Business rule enforcement',
  'Visibility for affected actors',
  'Integration alignment',
  'History and traceability',
  'Reporting and operational review',
];

const QUALITY = {
  businessProblem: 'Curators re-key equipment data from three supplier feeds by hand, which takes two days per release and lets duplicates through.',
  primaryActor: 'Catalogue curator',
  secondaryActors: ['Tenant administrator', 'Support engineer'],
  successMetrics: [
    '95% of imported records are published within 1 business day.',
    'Duplicate records fall below 1% of the published catalogue.',
    'A curator reviews a 500-record batch in under 30 minutes.',
  ],
  scopeBoundary: 'Include staging, review, de-duplication, and publishing of equipment records.',
  outOfScope: 'Exclude pricing, tenant-side editing, and supplier contract management.',
};

const REQUIREMENTS = {
  functionalRequirements: [
    { title: 'Stage imported records', requirement: 'The system MUST hold every imported record in staging until a curator publishes it.', acceptanceCriteria: ['- [ ] A staged record is invisible to tenants.', 'Publishing moves it to the live catalogue.'] },
    { title: 'Detect duplicates', requirement: 'The system MUST flag a staged record that matches a live record on make and model.', acceptanceCriteria: ['A flagged record cannot be published until resolved.'] },
    { title: 'Read API for tenants', requirement: 'The system MUST expose published records read-only to tenants.', acceptanceCriteria: ['A tenant request for a staged record returns 404.'] },
  ],
  userScenarios: [
    { title: 'Curator publishes a batch', actor: 'Catalogue curator', steps: ['Opens the staged batch.', 'Resolves duplicates.', 'Publishes.'], expectedOutcome: 'Every record in the batch is live.' },
    { title: 'Tenant reads the catalogue', actor: 'Tenant administrator', steps: ['Searches by make.'], expectedOutcome: 'Only published records are returned.' },
    { title: 'Feed sends a malformed record', actor: 'Catalogue curator', steps: ['Imports the feed.'], expectedOutcome: 'The record is rejected with its line number.' },
  ],
  dataRequirements: '| Table | Change |\n|---|---|\n| `equipmentstaging` | new |',
  apiRoutes: '| Method | Path |\n|---|---|\n| GET | `/api/equipment` |',
  frontendComponents: 'None',
  keyEntities: 'None — the existing equipment entity is reused.',
};

/** A hand-authored scope like 56b8f6d2's: real FRs with criteria, real scenarios, extra sections. */
const AUTHORED = [
  '# Scope 010: Permission Model',
  '',
  '**Scope Number**: 010',
  '',
  '## Overview',
  '',
  'Permissions are a single number on an ordered scale today, which cannot express per-module rights.',
  '',
  '## Actors',
  '',
  '- Primary: Security administrator',
  '- Secondary: Module owners, Auditors',
  '',
  '## User Scenarios & Testing',
  '',
  '### US1 — Grant a module right',
  '',
  '**Actor**: Security administrator',
  '',
  '### US2 — Audit a grant',
  '',
  '### US3 — Revoke on departure',
  '',
  '### US4 — Override for an incident',
  '',
  '## Functional Requirements',
  '',
  '### FR-001 — Per-module rights',
  '',
  'The system MUST grant rights per module.',
  '',
  '**Acceptance Criteria**:',
  '- [ ] A right on module A grants nothing on module B.',
  '- [ ] Rights resolve without MAX over a scale.',
  '',
  '### FR-002 — Overrides',
  '',
  'The system MUST record every override with its reason.',
  '',
  '**Acceptance Criteria**:',
  '- [ ] An override without a reason is refused.',
  '',
  '## Relationship to MCP-API Spec 021',
  '',
  '| Requirement | Disposition |',
  '|---|---|',
  '| R1 | Owned here |',
  '',
  '## Success Metrics',
  '',
  '1. 100% of module checks resolve in under 5 ms.',
  '2. 0 rights leak across modules in 1,000 randomized checks.',
  '3. 95% of overrides carry a reason within 1 minute.',
  '',
  '## Scope Boundary',
  '',
  'Include per-module rights, overrides, and their audit trail.',
  '',
  '## Out of Scope',
  '',
  'Exclude single sign-on and directory synchronization.',
  '',
  '## Open Questions',
  '',
  '- None.',
  '',
].join('\n');

/** The older, shorter copy 56b8f6d2 found in the project record: no FRs, criteria, or scenarios. */
const STORED_COPY = [
  '# Spec 010 — Permission Model',
  '',
  '## Overview',
  '',
  'Permissions are a single number on an ordered scale today.',
  '',
  '## Actors',
  '',
  '- Primary: Security administrator',
  '- Secondary: Module owners',
  '',
].join('\n');

describe.sequential('SPEC-135', () => {
  let originalCwd = '';
  let workspace = '';

  beforeEach(() => {
    specRows = [];
    scopeDocRows = [];
    originalCwd = process.cwd();
    workspace = mkdtempSync(join(tmpdir(), 'wxk-135-'));
    process.chdir(workspace);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('FR-001..FR-003 — the author\'s requirements render verbatim', () => {
    it('renders supplied FRs, criteria, and scenarios exactly, numbered in order', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...REQUIREMENTS });
      const doc = result.scopeContent as string;
      expect(doc).toContain('### FR-001 — Stage imported records');
      expect(doc).toContain('### FR-003 — Read API for tenants');
      expect(doc).toContain('- [ ] A staged record is invisible to tenants.');
      expect(doc).not.toContain('- [ ] - [ ]');
      expect(doc).toContain('### US3 — Feed sends a malformed record');
      expect(doc).toContain('1. Opens the staged batch.\n2. Resolves duplicates.\n3. Publishes.');
      expect(doc).toContain('**Expected outcome**: Every record in the batch is live.');
    });

    it('renders "None" as a sentence and keeps an author\'s reason, with no marker', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...REQUIREMENTS });
      const doc = result.scopeContent as string;
      expect(doc).toContain('## Frontend Components\n\nNone — not affected by this scope.');
      expect(doc).toContain('None — the existing equipment entity is reused.');
      expect(doc).not.toContain('NEEDS CLARIFICATION');
      expect(validateScopeContent(doc).placeholdersFound).toEqual([]);
    });

    it('keeps the blocking marker for a technical section that was omitted', async () => {
      const { apiRoutes: _omitted, ...withoutRoutes } = REQUIREMENTS;
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...withoutRoutes });
      expect(result.canProceedToCreateSpecs).toBe(false);
      expect(result.missingInputs).toEqual(['apiRoutes']);
      expect(result.scopeContent).toContain('Pass `apiRoutes`');
    });

    it('rejects an FR with an empty title or no criteria, naming the index', () => {
      const parsed = BuildScopeInputSchema.safeParse({
        featureDescription: 'x',
        functionalRequirements: [
          { title: 'ok', requirement: 'ok', acceptanceCriteria: ['ok'] },
          { title: '', requirement: 'ok', acceptanceCriteria: [] },
        ],
      });
      expect(parsed.success).toBe(false);
      const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['functionalRequirements.1.title', 'functionalRequirements.1.acceptanceCriteria']));
    });
  });

  describe('FR-004..FR-006 — no filler, ever; omissions are named and blocked', () => {
    it('SM 2: no boilerplate FR title or generic scenario in quick, guided, or templateOnly output', async () => {
      const outputs = [
        await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', quick: true }),
        await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', quick: true, templateOnly: true }),
        await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...REQUIREMENTS }),
      ];
      for (const output of outputs) {
        for (const title of BOILERPLATE_TITLES) {
          expect(output.scopeContent).not.toContain(title);
        }
        expect(output.scopeContent).not.toContain('initiates the primary');
      }
    });

    it('523f65ed quick reproduction: blocked, with every omitted input named', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', quick: true, ...QUALITY });
      expect(result.canProceedToCreateSpecs).toBe(false);
      expect(result.missingInputs).toEqual(['functionalRequirements', 'userScenarios', 'dataRequirements', 'apiRoutes', 'frontendComponents', 'keyEntities']);
      expect(result.nextSteps.join(' ')).toContain('Supply functionalRequirements, userScenarios');
    });

    it('guided mode asks for requirements and scenarios before it drafts', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY });
      expect(result.status).toBe('draft_interview');
      expect(result.questions.map((q) => q.field)).toEqual(expect.arrayContaining(['functionalRequirements', 'userScenarios']));
    });

    it('SM 1: the full interview supplied through the inputs scores 100 with 0 blockers', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...REQUIREMENTS });
      expect(result.qualityScore).toBe(100);
      expect(result.blockingIssues).toEqual([]);
      expect(result.canProceedToCreateSpecs).toBe(true);
    });
  });

  describe('FR-008 — validatescope and create_specs run one gate', () => {
    const CORE_DESIGN_ONLY = [
      '# Scope 001: Core Design only',
      '',
      '## Overview',
      'Curators re-key equipment data from three supplier feeds by hand, which takes two days per release.',
      '',
      '| Element | Value |',
      '| --- | --- |',
      '| **Primary Actor** | Catalogue curator |',
      '| **Secondary Actors** | Tenant administrator |',
      '| **Scope Boundary** | Include staging and publishing. Exclude pricing and tenant-side editing. |',
      '',
      '## Success Criteria',
      '1. 95% of records publish within 1 day.',
      '2. Duplicates fall below 1%.',
      '3. A 500-record batch is reviewed in under 30 minutes.',
      '',
      '## Clarifications',
      '- None.',
    ].join('\n');

    it('returns identical results from both entry points across the fixture set', async () => {
      const generated = (await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', ...QUALITY, ...REQUIREMENTS })).scopeContent as string;
      for (const doc of [AUTHORED, STORED_COPY, CORE_DESIGN_ONLY, generated]) {
        const a = validateScopeContent(doc);
        const b = createSpecsPreflight(doc);
        expect({ score: b.score, isValid: b.isValid, blockingIssues: b.blockingIssues }).toEqual({
          score: a.score,
          isValid: a.isValid,
          blockingIssues: a.blockingIssues,
        });
      }
      expect(validateScopeContent(CORE_DESIGN_ONLY).isValid).toBe(true);
    });
  });

  describe('FR-011 — 56b8f6d2: an edit merges into the author\'s document', () => {
    it('keeps every authored section, criterion, and scenario when currentScopeContent is sent', async () => {
      specRows = [{ title: 'Permission Model', content: STORED_COPY, updatedAt: new Date('2026-09-22T04:59:52Z') }];
      const result = await buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Correct the primary actor',
        primaryActor: 'Permission administrator',
        currentScopeContent: AUTHORED,
      });
      const doc = result.scopeContent as string;
      // MODIFIED-BY: [SCOPE 135 / T020] — everything before the new Amendment Log is the authored
      // document with exactly the one line changed; the log entry follows it.
      const expected = AUTHORED.replace('- Primary: Security administrator', '- Primary: Permission administrator');
      expect(doc.startsWith(expected.trimEnd())).toBe(true);
      expect(doc.slice(expected.trimEnd().length)).toMatch(/^\n\n## Amendment Log\n\n### \d{4}-\d{2}-\d{2}\n\n- Reason: No reason given\n- Items: actors\n/);
      expect(result.editBase).toEqual({
        source: 'caller',
        chars: AUTHORED.length,
        storedChars: STORED_COPY.length,
        storedUpdatedAt: '2026-09-22T04:59:52.000Z',
      });
      expect(result.status).toBe('draft_updated');
    });

    it('says plainly when it merged into the stored copy instead', async () => {
      specRows = [{ title: 'Permission Model', content: STORED_COPY, updatedAt: new Date('2026-09-22T04:59:52Z') }];
      const result = await buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Correct the primary actor',
        primaryActor: 'Permission administrator',
      });
      expect(result.editBase?.source).toBe('stored');
      expect(result.message).toContain('merged into the stored copy of spec 010');
      expect(result.message).toContain('last pushed 2026-09-22');
      expect(result.message).toContain('pass its text as currentScopeContent');
    });

    it('edits a local scope that was never pushed', async () => {
      specRows = [];
      const result = await buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Correct the primary actor',
        primaryActor: 'Permission administrator',
        currentScopeContent: AUTHORED,
      });
      expect(result.success).toBe(true);
      expect(result.filePath).toBe('specs/Project-Scope/010-permission-model.md');
      expect(result.scopeContent).toContain('- Primary: Permission administrator');
    });

    it('leaves the H1 alone when featureDescription describes the change', async () => {
      specRows = [{ title: 'Permission Model', content: STORED_COPY }];
      const result = await buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Four surgical edits to SCOPE-010',
        currentScopeContent: AUTHORED,
      });
      expect((result.scopeContent as string).split('\n')[0]).toBe('# Scope 010: Permission Model');
    });
  });

  describe('FR-012 — c4e40bb5: numbering counts the caller\'s unpushed specs', () => {
    const stored = (numbers: string[]) => numbers.map((specNumber) => ({ specNumber }));

    it('assigns 021 when 018-020 exist only on disk', async () => {
      specRows = stored(['001', '012', '014', '015', '016', '017']);
      const result = await buildScope({
        projectId: PROJECT,
        featureDescription: 'Program entry security',
        quick: true,
        localSpecNumbers: ['001', '015', '018', '019', '020'],
      });
      expect(result.specNumber).toBe('021');
      expect(result.numberingBasis).toBe('database+local');
      expect(result.takenSpecNumbers).toEqual(expect.arrayContaining(['017', '018', '020']));
    });

    it('says the count covered stored specs only when no local numbers were sent', async () => {
      specRows = stored(['001', '017']);
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Program entry security', quick: true });
      expect(result.specNumber).toBe('018');
      expect(result.numberingBasis).toBe('database');
      expect(result.message).toContain("counted from this project's stored specs only");
    });

    it('keeps a four-digit project four-digit, and one stray padded row cannot re-pad a three-digit one', async () => {
      specRows = stored(['0050', '0051']);
      expect((await buildScope({ projectId: PROJECT, featureDescription: 'IMAP ingestion', quick: true })).specNumber).toBe('0052');
      specRows = stored(['0110', '136']);
      expect((await buildScope({ projectId: PROJECT, featureDescription: 'IMAP ingestion', quick: true })).specNumber).toBe('137');
    });
  });

  describe('FR-013 — readable slug and title', () => {
    it('folds accented letters instead of dropping them (84f98f9c, a17783bb)', () => {
      expect(generateShortName('Écran de paramètres accessible')).toBe('ecran-parametres-accessible');
      expect(generateShortName('Report attività un interruttore mese')).toBe('report-attivita-interruttore-mese');
      expect(generateShortName("Gestion de l'accès des utilisateurs")).toBe('gestion-acces-utilisateurs');
      expect(generateShortName('Configuración de la facturación electrónica')).toBe('configuracion-facturacion-electronica');
      expect(generateShortName('Größenänderung für Bilder')).toBe('grossenanderung-bilder');
    });

    it('leaves ASCII slugs exactly as before', () => {
      expect(generateShortName('Consulting billing automation')).toBe('consulting-billing-automation');
      expect(generateShortName('UAT foundation for the e-commerce site')).toBe('foundation-e-commerce-site');
      expect(generateShortName("The user's MIT license audit")).toBe('user-s-mit-license-audit');
    });

    it('titles the H1 as a scope, capped at 8 words, or exactly the supplied title', async () => {
      const long = 'A global DDES-managed equipment reference catalogue with hierarchical categories, makes, models, specifications and parts, ingested from a licensed feed';
      expect(deriveScopeTitle(long).split(/\s+/).length).toBeLessThanOrEqual(8);
      const result = await buildScope({ projectId: PROJECT, featureDescription: long, quick: true, title: 'Equipment Catalogue' });
      expect((result.scopeContent as string).split('\n')[0]).toBe(`# Scope ${result.specNumber}: Equipment Catalogue`);
      expect(result.scopeContent).toContain(`**Scope Number**: ${result.specNumber}`);
      expect(result.shortName).toBe('equipment-catalogue');
    });
  });

  describe('FR-014 — 7874b04b: the checklist agrees with the gate', () => {
    const NO_CRITERIA = AUTHORED
      .replace(/\*\*Acceptance Criteria\*\*:\n(- \[ \] .*\n)+/g, '')
      .replace(/### US\d .*\n\n(\*\*Actor\*\*: .*\n\n)?/g, '');

    it('passes the gate, lists the gaps as advisories, and never shows an unticked Gate item', async () => {
      specRows = [{ title: 'Permission Model', content: NO_CRITERIA }];
      const result = await buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Review',
        currentScopeContent: NO_CRITERIA,
      });
      expect(result.canProceedToCreateSpecs).toBe(true);
      expect(result.qualityScore).toBe(100);
      expect(result.advisories).toEqual(expect.arrayContaining([
        'Every functional requirement has acceptance criteria',
        'At least 3 user scenarios defined (primary, secondary, edge case)',
      ]));
      const checklist = result.checklistContent as string;
      const gate = checklist.split('## Gate — blocks create_specs')[1].split('## Advisory')[0];
      expect(gate).not.toContain('- [ ]');
      expect(checklist.split('## Advisory — not enforced by the gate')[1]).toContain('- [ ] Every functional requirement has acceptance criteria');
      const warnings = validateScopeContent(NO_CRITERIA).warnings.join(' ');
      expect(warnings).toContain('have no acceptance criteria: FR-001, FR-002');
      expect(warnings).toContain('0 user scenario(s) found');
    });
  });

  describe('FR-015 — 17b7ae98: templateOnly reports what ran', () => {
    it('reports drafted and says templateOnly was ignored where no template exists', async () => {
      const result = await buildScope({ projectId: PROJECT, featureDescription: 'Equipment catalogue', quick: true, templateOnly: true });
      expect(result.status).toBe('drafted');
      expect(result.message).toContain('templateOnly was ignored');
    });
  });
  // [SCOPE 135 / T019] BEGIN — FR-021: stale-base refusal against the stored scope document
  describe('FR-021 — an edit refuses a file synced with an older stored copy (US9)', () => {
    const updatedAt = new Date('2026-10-27T15:00:00Z');
    const edit = (currentScopeContent?: string) =>
      buildScope({
        projectId: PROJECT,
        editSpecNumber: '010',
        featureDescription: 'Correct the primary actor',
        primaryActor: 'Permission administrator',
        ...(currentScopeContent !== undefined ? { currentScopeContent } : {}),
      });

    it('refuses before drafting when the stored copy changed since the file was synced', async () => {
      const synced = withScopeSyncMarker(AUTHORED, scopeSyncHash(AUTHORED), '2026-10-20T10:00:00Z');
      scopeDocRows = [{ title: '010-permission-model.md', content: `${AUTHORED}\nA colleague's change.\n`, updatedAt }];
      await expect(edit(synced)).rejects.toThrow(
        /scope 010 refused: the stored copy \(010-permission-model\.md\) changed .*updated 2026-10-27T15:00:00\.000Z, your file synced 2026-10-20T10:00:00Z/,
      );
    });

    it('passes when the synced hash matches, and keeps the marker line byte-identical', async () => {
      const synced = withScopeSyncMarker(AUTHORED, scopeSyncHash(AUTHORED), '2026-10-20T10:00:00Z');
      scopeDocRows = [{ title: '010-permission-model.md', content: AUTHORED, updatedAt }];
      const result = await edit(synced);
      expect(result.stalenessCheck).toMatchObject({ status: 'passed', syncedAt: '2026-10-20T10:00:00Z' });
      expect((result.scopeContent as string).split('\n')[0]).toBe(synced.split('\n')[0]);
      expect(result.scopeContent).toContain('- Primary: Permission administrator');
    });

    it('a CRLF local file matches an LF stored copy', async () => {
      const crlf = withScopeSyncMarker(AUTHORED.replace(/\n/g, '\r\n'), scopeSyncHash(AUTHORED), '2026-10-20T10:00:00Z');
      scopeDocRows = [{ title: '010-permission-model.md', content: AUTHORED, updatedAt }];
      expect((await edit(crlf)).stalenessCheck?.status).toBe('passed');
    });

    it('a pre-amendment file (no marker) edits normally with a "staleness check skipped" note', async () => {
      scopeDocRows = [{ title: '010-permission-model.md', content: 'anything', updatedAt }];
      const result = await edit(AUTHORED);
      expect(result.status).toBe('draft_updated');
      expect(result.stalenessCheck?.status).toBe('skipped');
      expect(result.message).toContain('Staleness check skipped');
    });

    it('with no local file sent, the edit merges into the stored scope document under its own name', async () => {
      specRows = [{ title: 'Permission Model', content: STORED_COPY, updatedAt }];
      scopeDocRows = [{ title: '010-permission-model.md', content: AUTHORED, updatedAt }];
      const result = await edit();
      expect(result.editBase).toMatchObject({ source: 'stored', chars: AUTHORED.length });
      expect(result.filePath).toBe('specs/Project-Scope/010-permission-model.md');
      expect(result.scopeContent).toContain('- Primary: Permission administrator');
    });

    it('ignores a scope row for a different number that shares the prefix', async () => {
      scopeDocRows = [{ title: '0100-other.md', content: 'x', updatedAt }];
      const synced = withScopeSyncMarker(AUTHORED, scopeSyncHash(AUTHORED), '2026-10-20T10:00:00Z');
      expect((await edit(synced)).stalenessCheck?.status).toBe('skipped');
    });
  });
  // [SCOPE 135 / T019] END
});
