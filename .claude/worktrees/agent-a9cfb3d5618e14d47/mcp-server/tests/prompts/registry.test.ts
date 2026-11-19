/**
 * Phase 2 — server-delivered prompt registry. Verifies the generated base64
 * registry decodes back to the readable methodology, so the kit's stub can fetch
 * the real wxConversion instructions at runtime.
 */
import { describe, it, expect } from 'vitest';
import { getCommandPrompt, listPromptCommands } from '../../src/prompts/registry.js';

describe('prompt registry', () => {
  it('lists the full premium set as server-delivered commands', () => {
    const keys = listPromptCommands();
    for (const k of ['buildscope', 'createspecs', 'analyzescope', 'validatescope', 'research', 'wxconversion', 'wxconversionscope', 'cwconversion', 'cwconversionscope', 'vbconversion', 'vbconversionscope', 'wxgod']) {
      expect(keys).toContain(k);
    }
  });

  it('serves the wxgod methodology and its on-demand reference documents by path key', () => {
    const body = getCommandPrompt('wxgod');
    expect(body).toBeTruthy();
    expect(body).toContain('Guru of Development');
    expect(body).toContain('wxgod/references/god-persona');
    expect(body).toContain('scripts/inventory.mjs');
    for (const ref of ['god-persona', 'new-project', 'review-and-brainstorm', 'document-templates', 'interview', 'database-options', 'data-integrity', 'flow-diagrams', 'business-rules']) {
      const doc = getCommandPrompt(`wxgod/references/${ref}`);
      expect(doc, ref).toBeTruthy();
      expect((doc ?? '').length, ref).toBeGreaterThan(500);
    }
    // The old flat key for a sub-document must not resolve.
    expect(getCommandPrompt('god-persona')).toBeNull();
  });

  it('carries SCOPE-136: roadmap folded in, --create, parallel implement, bridge, defect stop', () => {
    const keys = listPromptCommands().filter((k) => k.startsWith('wxgod/'));
    // FR-002/FR-010: the roadmap template joined document-templates; FR-027 added business-rules.
    expect(keys).toHaveLength(9);
    const all = keys.concat('wxgod').map((k) => getCommandPrompt(k) ?? '').join('\n');
    // FR-010/FR-011: no step may depend on the retired dev-plan skill.
    expect(all).not.toContain('.claude/skills/dev-plan');
    expect(all).toContain('.claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs');
    expect(getCommandPrompt('wxgod/references/document-templates')).toContain('## 2. Development plan');
    const method = getCommandPrompt('wxgod') ?? '';
    expect(method).toContain('## Roadmap only (`--roadmap`)');
    expect(method).toContain('**Stop and report a defect.**');
    const np = getCommandPrompt('wxgod/references/new-project') ?? '';
    expect(np).toContain('## N8b. Parallel implementation');
    expect(np).toContain('## N11. `--create`');
    expect(np).toContain('## N12. Unattended under the Remote Session Bridge');
  });

  it('carries SPEC-136 FR-025/FR-026: commercial and delivery questions, projected SaaS cost', () => {
    // FR-025: one shared definition of the opening questions serves both modes.
    const review = getCommandPrompt('wxgod/references/review-and-brainstorm') ?? '';
    expect(review).toContain('## Opening questions');
    expect(review).toContain('**Commercial or not?**');
    expect(review).toContain('**Web-based or installed?**');
    // New-project mode: the idea brainstorm opens with them; the interview asks them when it is skipped.
    const np = getCommandPrompt('wxgod/references/new-project') ?? '';
    expect(np).toContain('§ Opening questions');
    expect(np).toMatch(/\| NP7 \| Will it be commercial/);
    expect(np).toMatch(/\| NP8 \| Commercial only/);
    // Plan mode (existing projects): asked before review section 1, with interview fallbacks PD1-PD3.
    expect(getCommandPrompt('wxgod') ?? '').toContain('Before section 1, ask the three opening questions');
    expect(getCommandPrompt('wxgod/references/interview') ?? '').toMatch(/\| PD3 \| Commercial only/);
    // FR-026: the separate cost document — five lowest-cost options plus AWS, never priced from memory.
    const db = getCommandPrompt('wxgod/references/database-options') ?? '';
    expect(db).toContain('## Projected SaaS cost (web-based systems)');
    expect(db).toContain('**Keep five, plus AWS.**');
    expect(db).toContain('Never price from memory.');
    const templates = getCommandPrompt('wxgod/references/document-templates') ?? '';
    expect(templates).toContain('## 5. Projected SaaS cost: `docs/GOD-SaaS-Cost.md`');
    // The customer document keeps cost tiers; real prices live only in the separate document.
    expect(db).toContain('Use cost tiers, not prices.');
  });

  it('carries SPEC-136 FR-027/FR-028: every business rule extracted, best-practice rules proposed', () => {
    const br = getCommandPrompt('wxgod/references/business-rules') ?? '';
    // FR-027: exhaustive extraction with proven coverage, into the BR- register.
    expect(br).toContain('**Every code file is read in full.**');
    expect(br).toContain('**Prove the coverage.**');
    expect(br).toContain('## The register: `docs/GOD-Business-Rules.md`');
    // FR-028: labeled proposals, never presented as fact.
    expect(br).toContain('**Best practice (proposed)**');
    // Plan mode: the review gains section 2, Business rules; the intake never samples rules.
    const review = getCommandPrompt('wxgod/references/review-and-brainstorm') ?? '';
    expect(review).toContain('## The five sections');
    expect(review).toMatch(/\| 2 \| \*\*Business rules\*\* \|/);
    expect(getCommandPrompt('wxgod') ?? '').toContain('**Business rules are the exception: never sampled.**');
    // New-project mode: rules come right after the two opening questions and land in scope drafts.
    const np = getCommandPrompt('wxgod/references/new-project') ?? '';
    expect(np).toContain('**Then the business rules.**');
    expect(np).toContain('citing its `BR-` ID');
  });

  it('carries SPEC-136 FR-030 to FR-034: build vs buy, personas, price and margin, SLA, readiness', () => {
    const review = getCommandPrompt('wxgod/references/review-and-brainstorm') ?? '';
    const interview = getCommandPrompt('wxgod/references/interview') ?? '';
    // FR-030: who it is for comes first; build vs buy / competitors for internal builds only.
    expect(review).toContain('**Who is it for?**');
    expect(review).toContain('**Build vs buy, or competitors (internal builds only).**');
    expect(review).toContain('Never raise it in consulting.');
    // FR-031: user personas, defined once in the management plan template.
    expect(getCommandPrompt('wxgod/references/document-templates') ?? '').toContain('3.1 User personas');
    expect(getCommandPrompt('wxgod/references/new-project') ?? '').toContain('**Then the user personas.**');
    // FR-032: price and margin live only in the internal cost document.
    const db = getCommandPrompt('wxgod/references/database-options') ?? '';
    expect(db).toContain('**Price and margin (commercial only).**');
    expect(db).toContain('never customer-facing');
    // FR-033 and FR-034: SLA and the quality-and-readiness questions.
    expect(interview).toMatch(/\| D8 \| What service level/);
    expect(interview).toContain('## Quality and readiness');
    expect(interview).toMatch(/\| QR1 \|[^\n]*WCAG 2\.2/);
    expect(interview).toContain('dependency license check');
  });

  it('carries SPEC-136 FR-029: built to released with existing commands only', () => {
    const np = getCommandPrompt('wxgod/references/new-project') ?? '';
    expect(np).toContain('## N8c. From built to released');
    for (const cmd of ['/wxUIUXCodeReview', '/wxConversionParity', '/wxCreateTestPlan --Execute', '/autofix-tests', '/wxHelpGenerate']) {
      expect(np, cmd).toContain(cmd);
    }
    // Each scope advances itself (SPEC-123); G.O.D. reads its stage and verifies the gates.
    expect(np).toContain('project.scope_stage');
    expect(np).toContain('project.test_gate_status');
    expect(np).not.toContain('Advance** button');
    // Broken lifecycle commands are named as gaps, never run.
    expect(np).toContain('Never run them; N8c uses the real commands and the per-scope advance');
  });

  it('carries the SPEC-136 FR-015 amendment: --create completes the process', () => {
    const body = getCommandPrompt('wxgod') ?? '';
    const np = getCommandPrompt('wxgod/references/new-project') ?? '';
    // Plan and new-project modes still never substitute; --create is the exception.
    expect(body).toContain('In new-project mode without `--create`, orchestrates and never substitutes.');
    expect(body).toContain('Once `--create` starts, completes the process.');
    // Gates answered from the approved design, every answer and repair logged.
    for (const key of ['gateLog', 'repairs', 'preexistingChanges', 'commits']) {
      expect(np, key).toContain(`"${key}"`);
    }
    // Commits only: never a push, deploy, production target, or human-test sign-off.
    expect(np).toContain('G.O.D. never signs off a human test or marks one passed.');
    expect(np).toMatch(/Never\s+push, never deploy, and never point a command at a production database, host, or account\./);
    expect(body).toContain('**Never pushes.**');
  });

  it('carries the SPEC-136 FR-018 amendment: read-only helpers are not bound by the machine maximum', () => {
    // Feedback 053e872b: the machine maximum models local build and test load, which a read-only
    // helper never creates, so on an 18 GB machine it serialized intake for no reason.
    const flat = (s: string) => s.replace(/\s+/g, ' ');
    const keys = listPromptCommands().filter((k) => k.startsWith('wxgod/')).concat('wxgod');
    for (const key of keys) {
      expect(flat(getCommandPrompt(key) ?? ''), key).not.toMatch(/never more than the machine maximum/i);
    }
    const body = flat(getCommandPrompt('wxgod') ?? '');
    expect(body).toContain('never more than the user\'s cap (`--cap`, T5). The machine maximum from `scripts/machine-capacity.mjs` does not limit them.');
    // The machine maximum still limits implementation (FR-018).
    expect(body).toContain('implementation never uses more agents at once than the lower of the two');
  });

  it('decodes every registered prompt to non-empty text', () => {
    for (const k of listPromptCommands()) {
      expect((getCommandPrompt(k) ?? '').length).toBeGreaterThan(50);
    }
  });

  it('decodes the wxconversion methodology body intact', () => {
    const body = getCommandPrompt('wxconversion');
    expect(body).toBeTruthy();
    expect(body).toContain('PCSoft');
    expect(body).toContain('Stage 1 — Split the PDF');
    expect(body).toContain('pcsoft-doc-split.py');
    // Round-trips multibyte content (em dashes, U+203A) without corruption.
    expect(body).toContain('—');
  });

  it('decodes the cwconversion methodology body intact', () => {
    const body = getCommandPrompt('cwconversion');
    expect(body).toBeTruthy();
    expect(body).toContain('Clarion');
    expect(body).toContain('Stage 1 — Split the source');
    expect(body).toContain('clarion-app-split.py');
    // Round-trips multibyte content (em dashes) without corruption.
    expect(body).toContain('—');
  });

  it('decodes the vbconversion methodology body intact', () => {
    const body = getCommandPrompt('vbconversion');
    expect(body).toBeTruthy();
    expect(body).toContain('Visual Basic 6');
    expect(body).toContain('Stage 1 — Split the project');
    expect(body).toContain('vb6-project-split.py');
    expect(body).toContain('—');
  });

  it('returns null for an unknown command', () => {
    expect(getCommandPrompt('not-a-real-command')).toBeNull();
    expect(getCommandPrompt('')).toBeNull();
  });
});
