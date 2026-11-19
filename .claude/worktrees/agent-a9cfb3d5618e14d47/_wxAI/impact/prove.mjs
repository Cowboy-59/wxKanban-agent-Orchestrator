#!/usr/bin/env node
// Change Impact proof fixtures (SCOPE-137 FR-014).
//
// A link type, or a language profile, is only as good as the evidence that it
// finds what it claims. Each fixture is a small project with seeded links; this
// writes it to a temporary folder, runs the engine once per case, and reports
// every expected link it did not find, every label that came out wrong, and
// every link it found that it should not have.
//
// The adapter validator runs this before it accepts `**Links proof:** passed`
// (SC-8), and the engine labels a profile's links Confirmed only when an adapter
// for that profile carries that line.
//
// Usage:
//   node _wxAI/impact/prove.mjs                 every fixture
//   node _wxAI/impact/prove.mjs csharp [--json] the fixture for one profile

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReport, parseLines } from './change-impact.mjs';
import { FIXTURES } from './fixtures/index.mjs';

export { FIXTURES };

// [SCOPE 137 / T015] BEGIN — Run one proof fixture and compare every link it seeds (FR-014, SC-1)
const matches = (link, want) =>
  link.type === want.type
  && link.to === want.to
  && (!want.direction || link.direction === want.direction)
  && (!want.from || link.from === want.from);

/**
 * Write the fixture to a temporary folder, run each case, and compare.
 * Returns { name, profile, passed, cases: [{ name, passed, problems: [] }] }.
 */
export function proveFixture(fixture) {
  const root = mkdtempSync(join(tmpdir(), `impact-proof-${fixture.name}-`));
  try {
    for (const [file, content] of Object.entries(fixture.files)) {
      const full = join(root, file);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const cases = fixture.cases.map((c) => {
      const problems = [];
      let report;
      try {
        report = buildReport({
          root,
          changedFiles: c.changed,
          useCache: false,
          precise: Boolean(c.precise),
          ranges: c.precise ? parseLines(c.precise) : null,
        });
      } catch (e) {
        return { name: c.name, passed: false, problems: [`engine failed: ${e instanceof Error ? e.message : e}`] };
      }
      for (const want of c.expect ?? []) {
        const found = report.links.filter((l) => matches(l, want));
        if (!found.length) {
          problems.push(`missing ${want.type} link to ${want.to}`);
        } else if (want.confidence && !found.some((l) => l.confidence === want.confidence)) {
          problems.push(`${want.type} link to ${want.to} labeled ${found[0].confidence}, expected ${want.confidence}`);
        }
      }
      for (const absent of c.expectAbsent ?? []) {
        if (report.links.some((l) => matches(l, absent))) problems.push(`unexpected ${absent.type} link to ${absent.to}`);
      }
      return { name: c.name, passed: problems.length === 0, problems };
    });
    return { name: fixture.name, profile: fixture.profile, passed: cases.every((c) => c.passed), cases };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Prove the fixture for one `**Links profile:**` value; null when the profile has none. */
export function proveProfile(profile) {
  const fixture = FIXTURES[profile];
  return fixture ? proveFixture(fixture) : null;
}
// [SCOPE 137 / T015] END

// [SCOPE 137 / T015] BEGIN — Proof CLI (FR-014)
function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const names = args.filter((a) => !a.startsWith('--'));
  const unknown = names.filter((n) => !FIXTURES[n]);
  if (unknown.length) {
    process.stderr.write(`No proof fixture for: ${unknown.join(', ')}. Fixtures: ${Object.keys(FIXTURES).join(', ')}\n`);
    process.exit(2);
  }
  const results = (names.length ? names : Object.keys(FIXTURES)).map((n) => proveFixture(FIXTURES[n]));
  if (json) {
    process.stdout.write(JSON.stringify({ results, passed: results.every((r) => r.passed) }, null, 2) + '\n');
  } else {
    for (const r of results) {
      process.stdout.write(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name} (profile ${r.profile})\n`);
      for (const c of r.cases) {
        process.stdout.write(`  ${c.passed ? 'ok  ' : 'FAIL'}  ${c.name}\n`);
        for (const p of c.problems) process.stdout.write(`          ${p}\n`);
      }
    }
  }
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv);
// [SCOPE 137 / T015] END
