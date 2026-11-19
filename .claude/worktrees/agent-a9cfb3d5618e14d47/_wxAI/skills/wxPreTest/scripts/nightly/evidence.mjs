// Nightly Testing: compliance evidence (SCOPE-140 FR-013, FR-014).
//
// After a COMPLETELY successful run only (every test green, the permission check passed, cleanup
// verified, the secret scan clean), and only for the frameworks ticked in the project's compliance
// settings, the run writes artifacts/<release version>/<framework>/:
//   evidence.json   what was checked and what was found, mapped to the framework's control ids
//   evidence.pdf    the same, readable (SCOPE-126 wording; the PDF is drawn with the run's own
//                   Chromium, because the app's MarkdownPdfRenderer is not available in a
//                   customer's project)
//   manifest.json   the SHA-256 of each file; the fingerprints are recorded in wxKanban
// The wording states what was checked and found. It never says compliant or certified. ISO text is
// described in our own words, with the 15-of-93 Annex A coverage stated.
//
// HITRUST is written only from the customer's own crosswalk to CSF v11.9.0, signed by their
// External Assessor and kept in their project. The kit ships no CSF content and never uses the
// local 01-17 taxonomy as CSF.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 140 / T013] BEGIN — The green gate and the framework mappings (FR-013)
/** Whether this run may produce evidence, and if not, every reason why. */
export function evidenceGate({ results, permission, cleanup, secretScan }) {
  const reasons = [];
  const failed = results.filter((r) => r.status === 'fail').length;
  const flaky = results.filter((r) => r.status === 'flaky').length;
  const notRun = results.filter((r) => ['skip', 'blocked', 'unresolved'].includes(r.status)).length;
  if (!results.length) reasons.push('no test ran');
  if (failed) reasons.push(`${failed} test(s) failed`);
  if (flaky) reasons.push(`${flaky} test(s) were flaky (failed, then passed)`);
  if (notRun) reasons.push(`${notRun} test(s) did not run to a result`);
  if (!permission?.ok) reasons.push(permission?.empty ? 'no admin pages were sampled for the permission check' : 'the permission check did not pass');
  if (!cleanup?.removed && cleanup?.choice === 'remove') reasons.push('cleanup was not verified');
  if (secretScan?.length) reasons.push(`the secret scan found ${secretScan.length} finding(s)`);
  return { green: reasons.length === 0, reasons };
}

/** Framework codes as project.get_compliance_context names them. */
export const FRAMEWORKS = ['SOC2', 'HIPAA', 'GDPR', 'NIST_SSDF', 'ISO27001', 'HITRUST'];

// What the nightly run checks, in our own words. Every control id below exists in the SCOPE-112 /
// SCOPE-113 catalogs (src/db/migrations 0011, 0014, 0015, 0017, 0018); a test asserts it.
export const CHECKS = {
  'separate-environment': 'The run used a separate, non-production database instance and a UAT app address, and refused anything else',
  'permission-check': 'A normal-user account was refused on a sample of admin-only pages',
  'tests-green': 'Every selected planned test passed (failures re-run once; none flaky)',
  'change-log': 'The changes since the last run and what they reached (SCOPE-137) chose what was tested first',
  'run-record': 'The run, its results and its timing were recorded in wxKanban by the Designated Agent',
  'cleanup-verified': 'The run removed the test data it created and verified the removal',
  'secret-scan': 'Every output of the run was scanned for credentials and none were found',
  'test-data': 'Only seeded demonstration data was used; no production data was copied',
};

export const MAPPINGS = {
  SOC2: {
    title: 'SOC 2 Trust Services Criteria',
    controls: [
      { id: 'CC6.1', about: 'logical access is restricted to authorized users', checks: ['permission-check'] },
      { id: 'CC6.3', about: 'access follows the role it was granted', checks: ['permission-check'] },
      { id: 'CC7.1', about: 'changes and configurations are monitored for problems', checks: ['tests-green', 'run-record'] },
      { id: 'CC7.2', about: 'the system is monitored and anomalies are looked into', checks: ['run-record', 'tests-green'] },
      { id: 'CC8.1', about: 'changes are tested before they reach production', checks: ['change-log', 'tests-green', 'separate-environment'] },
      { id: 'C1.1', about: 'confidential information is protected', checks: ['separate-environment', 'test-data', 'cleanup-verified', 'secret-scan'] },
    ],
  },
  HIPAA: {
    title: 'HIPAA Security Rule',
    controls: [
      { id: '164.308(a)(1)(i)', about: 'security management: finding and reducing risk', checks: ['tests-green', 'change-log'] },
      { id: '164.308(a)(8)', about: 'periodic technical evaluation of safeguards', checks: ['tests-green', 'permission-check', 'run-record'] },
      { id: '164.312(a)(1)', about: 'access control: only permitted users reach protected functions', checks: ['permission-check'] },
      { id: '164.312(b)', about: 'audit controls: activity is recorded and can be examined', checks: ['run-record'] },
    ],
  },
  GDPR: {
    title: 'GDPR',
    controls: [
      { id: 'Art.25(1)', about: 'data protection by design: test runs use demonstration data only', checks: ['test-data', 'separate-environment'] },
      { id: 'Art.32(1)(b)', about: 'ongoing confidentiality and integrity of processing', checks: ['permission-check', 'secret-scan'] },
      { id: 'Art.32(1)(d)', about: 'regular testing and evaluation of security measures', checks: ['tests-green', 'run-record', 'cleanup-verified'] },
    ],
  },
  NIST_SSDF: {
    title: 'NIST SSDF v1.1 (SP 800-218)',
    controls: [
      { id: 'PO.5.1', about: 'development and test environments are separated from production', checks: ['separate-environment'] },
      { id: 'PW.7.2', about: 'code is reviewed and analyzed for defects', checks: ['change-log'] },
      { id: 'PW.8.2', about: 'executable code is tested for defects and vulnerabilities', checks: ['tests-green', 'permission-check'] },
      { id: 'RV.1.1', about: 'information about potential defects is gathered and acted on', checks: ['run-record'] },
    ],
  },
  ISO27001: {
    title: 'ISO/IEC 27001:2022 Annex A, software development slice (15 of 93 controls; no ISMS)',
    controls: [
      { id: 'A.8.29', about: 'security is tested during development and acceptance', checks: ['tests-green', 'permission-check'] },
      { id: 'A.8.31', about: 'development, test and production environments are kept apart', checks: ['separate-environment'] },
      { id: 'A.8.32', about: 'changes are controlled and checked', checks: ['change-log', 'tests-green'] },
      { id: 'A.8.33', about: 'test information is chosen, protected and managed', checks: ['test-data', 'cleanup-verified'] },
      { id: 'A.8.15', about: 'activities are logged', checks: ['run-record'] },
      { id: 'A.8.16', about: 'systems are monitored for unusual behavior', checks: ['run-record', 'tests-green'] },
      { id: 'A.5.3', about: 'duties are separated: the run proposes fixes and never applies them', checks: ['run-record'] },
      { id: 'A.8.34', about: 'testing is planned so it does not disturb operational systems', checks: ['separate-environment', 'cleanup-verified'] },
    ],
  },
};

const BANNED = /\b(compliant|certified|certifies|compliance (is )?(achieved|met|guaranteed))\b/i;

/** Throws when generated wording claims compliance or certification (SCOPE-126 rule). */
export function assertWording(text) {
  const m = BANNED.exec(String(text));
  if (m) throw new Error(`evidence wording may not say "${m[0]}": state what was checked and found`);
  return text;
}
// [SCOPE 140 / T013] END

// [SCOPE 140 / T013] BEGIN — evidence.json, the PDF, and the fingerprinted manifest (FR-013)
export const STATEMENT = 'This record states what the nightly run checked and what it found, on the date shown. It draws no conclusion about the system as a whole; that is for the auditor or assessor.';

/** The evidence document for one framework (pure). */
export function buildEvidence({ framework, mapping, run, found }) {
  const controls = mapping.controls.map((c) => ({
    id: c.id,
    about: c.about,
    checks: c.checks.map((k) => ({ check: k, what: CHECKS[k], found: found[k] ?? 'not recorded' })),
  }));
  const doc = {
    framework,
    title: mapping.title,
    releaseVersion: run.releaseVersion,
    runId: run.runId,
    runAt: run.runAt,
    designatedAgent: run.agent,
    environment: run.environment,
    statement: STATEMENT,
    controls,
    changeLog: run.changeLog ?? [],
    results: run.results,
  };
  assertWording(JSON.stringify(doc));
  return doc;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function evidenceHtml(doc) {
  const rows = doc.controls
    .map((c) => `<tr><td><b>${esc(c.id)}</b><br>${esc(c.about)}</td><td>${c.checks.map((k) => `<p><b>${esc(k.what)}.</b><br>Found: ${esc(k.found)}</p>`).join('')}</td></tr>`)
    .join('');
  const changes = (doc.changeLog ?? []).map((c) => `<li>${esc(c)}</li>`).join('') || '<li>No change since the last run.</li>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}: nightly test evidence</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:11px;color:#111;margin:32px}h1{font-size:18px}table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:6px;vertical-align:top}td:first-child{width:28%}.meta td{border:none;padding:2px 8px 2px 0}footer{margin-top:24px;color:#666;font-size:9px}</style></head><body>
<h1>${esc(doc.title)}: nightly test evidence</h1>
<table class="meta"><tr><td>Release</td><td>${esc(doc.releaseVersion)}</td></tr><tr><td>Run</td><td>${esc(doc.runId)} at ${esc(doc.runAt)}</td></tr><tr><td>Designated Agent</td><td>${esc(doc.designatedAgent)}</td></tr><tr><td>Environment</td><td>${esc(doc.environment.app)} · database ${esc(doc.environment.database)}</td></tr><tr><td>Results</td><td>${esc(`${doc.results.passed} passed, ${doc.results.failed} failed, ${doc.results.total} tested`)}</td></tr></table>
<p>${esc(doc.statement)}</p>
<table>${rows}</table>
<h2>Changes since the last run</h2><ul>${changes}</ul>
<footer>Generated with wxKanban. Fingerprints of this file and evidence.json are in manifest.json and recorded in wxKanban.</footer>
</body></html>`;
  return assertWording(html);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Write one framework's folder: evidence.json, evidence.pdf (when a renderer is given) and
 * manifest.json. A later green run for the same version replaces the folder. Returns the manifest.
 */
export async function writeArtifacts(root, doc, { renderPdf = null } = {}) {
  const dir = join(root, 'artifacts', doc.releaseVersion, doc.framework);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = [];
  const json = Buffer.from(JSON.stringify(doc, null, 2) + '\n');
  writeFileSync(join(dir, 'evidence.json'), json);
  files.push({ file: 'evidence.json', sha256: sha256(json), bytes: json.length });
  if (renderPdf) {
    const pdf = await renderPdf(evidenceHtml(doc));
    writeFileSync(join(dir, 'evidence.pdf'), pdf);
    files.push({ file: 'evidence.pdf', sha256: sha256(pdf), bytes: pdf.length });
  }
  const manifest = { framework: doc.framework, releaseVersion: doc.releaseVersion, runId: doc.runId, writtenAt: new Date().toISOString(), files };
  const m = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(dir, 'manifest.json'), m);
  return { dir, manifest, manifestSha256: sha256(m) };
}

/** A PDF renderer on the run's own Chromium (Playwright). */
export function chromiumPdf(chromium) {
  return async (html) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' } });
    } finally {
      await browser.close();
    }
  };
}

/** artifacts/ stays out of git unless the project opts in (nightly.commitArtifacts). */
export function ensureArtifactsIgnored(root, commitArtifacts) {
  if (commitArtifacts) return false;
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (text.split(/\r?\n/).some((l) => l.trim() === '/artifacts/' || l.trim() === 'artifacts/')) return false;
  writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}# Nightly compliance evidence (SCOPE-140); set nightly.commitArtifacts to keep it in git\n/artifacts/\n!/artifacts/hitrust-crosswalk/\n`);
  return true;
}
// [SCOPE 140 / T013] END

// [SCOPE 140 / T014] BEGIN — HITRUST: only from the customer's assessor-signed CSF v11.9.0 crosswalk (FR-014)
export const HITRUST_CSF_VERSION = '11.9.0';
export const CROSSWALK_FILE = join('artifacts', 'hitrust-crosswalk', 'crosswalk.json');

/**
 * The customer's crosswalk, or the reason none can be used. Required: CSF version, a crosswalk
 * version, that it was derived from the customer's licensed CSF, a NIST cross-check, and the
 * External Assessor's sign-off. A crosswalk for an older CSF than the project's current one is
 * flagged for re-review and not used.
 */
export function readCrosswalk(root, { currentCsf = HITRUST_CSF_VERSION } = {}) {
  const file = join(root, CROSSWALK_FILE);
  if (!existsSync(file)) return { ok: false, reason: `no signed HITRUST crosswalk at ${CROSSWALK_FILE.replace(/\\/g, '/')}; no HITRUST artifact was written` };
  let cw;
  try {
    cw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'the HITRUST crosswalk could not be read' };
  }
  const missing = [];
  if (!cw.csfVersion) missing.push('csfVersion');
  if (!cw.crosswalkVersion) missing.push('crosswalkVersion');
  if (cw.derivedFrom !== 'customer-licensed-csf') missing.push('derivedFrom "customer-licensed-csf"');
  if (cw.nistCrossCheck !== true) missing.push('nistCrossCheck');
  if (!cw.assessor?.name || !cw.assessor?.organization || !cw.assessor?.signedAt) missing.push('assessor sign-off (name, organization, signedAt)');
  if (!Array.isArray(cw.mappings) || !cw.mappings.length) missing.push('mappings');
  if (missing.length) return { ok: false, reason: `the HITRUST crosswalk is not signed off or is incomplete (${missing.join(', ')}); no HITRUST artifact was written` };
  if (cw.source === 'wxkanban-local-taxonomy') return { ok: false, reason: 'the crosswalk uses the local 01-17 taxonomy, which is not HITRUST CSF; no HITRUST artifact was written' };
  if (compareVersions(cw.csfVersion, currentCsf) < 0) {
    return { ok: false, reason: `the crosswalk is for CSF ${cw.csfVersion} but the project uses ${currentCsf}; it needs the assessor's re-review before HITRUST evidence is written`, reReview: true };
  }
  const unknown = cw.mappings.flatMap((m) => (m.checks ?? []).filter((k) => !CHECKS[k]));
  if (unknown.length) return { ok: false, reason: `the crosswalk names checks the nightly run does not perform: ${[...new Set(unknown)].join(', ')}` };
  return { ok: true, crosswalk: cw };
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The HITRUST mapping, built only from the customer's crosswalk: their control ids, our checks. */
export function hitrustMapping(crosswalk) {
  return {
    title: `HITRUST CSF v${crosswalk.csfVersion} (customer crosswalk v${crosswalk.crosswalkVersion}, signed by ${crosswalk.assessor.name}, ${crosswalk.assessor.organization}, ${crosswalk.assessor.signedAt})`,
    controls: crosswalk.mappings.map((m) => ({ id: m.csfRef, about: m.about ?? 'as described in the customer crosswalk', checks: m.checks ?? [] })),
  };
}
// [SCOPE 140 / T014] END
