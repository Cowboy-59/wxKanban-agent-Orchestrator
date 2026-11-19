#!/usr/bin/env node
/**
 * File the SPEC-111 test suite into wxKanban through the hosted MCP.
 *
 * Calls the SAME tool the skill specifies — project.upsert_test_plan — rather
 * than writing to the database directly, so the filing goes through the real
 * consumer interface (token scoping, permission matrix, validation) exactly as a
 * kit consumer's would. It is invoked from a script only because the payload is
 * ~400KB and cannot be typed into a tool call by hand.
 *
 *   node scripts/file-test-suite-111.mjs [--batch <n>] [--dry-run] [--verify]
 *
 * Batched because a single 400KB request is a poor bet against any gateway body
 * limit. Batching is safe *if* the tool upserts rather than replaces — which
 * --verify checks empirically rather than assuming.
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const dryRun = argv.includes('--dry-run');
const verifyOnly = argv.includes('--verify');
const BATCH = Number(arg('batch', '25'));

const MCP_URL = process.env.WXKANBAN_MCP_URL || 'https://mcp.wxperts.com/mcp';
const TOKEN = process.env.WXKANBAN_API_TOKEN;
if (!TOKEN) { console.error('WXKANBAN_API_TOKEN not set'); process.exit(1); }

const PROJECT_ID = 'ba924193-0335-4080-9fa6-33cd6b81300a'; // wxKanban Development
const SPEC_ID = 'f5552f9a-e581-46d1-8cdf-6e09569d1b22';     // SPEC-111 Test Suite Lifecycle

const src = JSON.parse(readFileSync('tests/testplans/111-test-suite-lifecycle/test-items.json', 'utf8'));

/**
 * Map a plan record onto the tool's input shape.
 *
 * `detail` carries everything the interface renders and a runner consumes. The
 * data-layer extension keys ride inside it too, so a `layer: data` item keeps its
 * seed and teardown — an item whose starting state is unspecified is invalid.
 *
 * `subjects` is renamed to the tool's camelCase contract. This is load-bearing:
 * impact analysis walks from these, and an item with no subject fails safe to
 * Retest on every single release, so a silently dropped subject costs a person
 * real time forever.
 */
const toToolItem = (i) => {
  const detail = {
    preconditions: i.preconditions,
    testData: i.testData,
    steps: i.steps,
    flow: i.flow,
    postconditions: i.postconditions,
    exemptions: i.exemptions,
    rationale: i.rationale,
    tags: i.tags,
    clarificationId: i.clarificationId,
    parentId: i.parentId,
    blockedReason: i.blockedReason,
  };
  if (i.layer === 'data') {
    detail.targetObjects = i.targetObjects;
    detail.isolationLevel = i.isolationLevel;
    detail.seedScript = i.seedScript;
    detail.teardownScript = i.teardownScript;
    detail.expectedPlan = i.expectedPlan;
  }
  const out = {
    itemKey: i.id,
    title: i.title,
    executor: i.executor,
    gate: i.gate,
    detail,
    layer: i.layer,
    variant: i.variant,
    priority: i.priority,
    riskTier: i.riskTier,
    testLevel: i.testLevel,
    tier: i.tier,
    origin: i.origin,
    automation: i.automation,
    subjects: (i.subjects ?? []).map((s) => ({
      sourcePath: s.sourcepath,
      unitId: s.unitid ?? undefined,
      role: s.role ?? 'primary',
    })),
  };
  if (i.requirementId) out.requirementId = i.requirementId;
  if (i.specRef) out.specRef = i.specRef;
  if (i.fenceRef) out.fenceRef = i.fenceRef;
  if (i.automationRef) out.automationRef = i.automationRef;
  return out;
};

const items = src.items.map(toToolItem);

// Refuse to file an item with no subject rather than discovering it later as a
// permanent Retest. Cheaper to fail here than to hand a tester recurring work.
const noSubject = items.filter((i) => !i.subjects.length).map((i) => i.itemKey);
if (noSubject.length) {
  console.error(`REFUSING: ${noSubject.length} item(s) declare no subject: ${noSubject.join(', ')}`);
  process.exit(1);
}

let callId = 1;
async function callTool(name, args) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: callId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  // The endpoint may answer as SSE even for a unary call.
  const jsonLine = text.startsWith('event:') || text.startsWith('data:')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
    : text;
  let parsed;
  try { parsed = JSON.parse(jsonLine); } catch { throw new Error(`unparseable response: ${text.slice(0, 400)}`); }
  if (parsed.error) throw new Error(`tool error: ${JSON.stringify(parsed.error).slice(0, 400)}`);
  const content = parsed.result?.content?.[0]?.text;
  try { return content ? JSON.parse(content) : parsed.result; } catch { return content; }
}

if (verifyOnly) {
  console.log('verify: reading the filed suite back through the API');
  const back = await callTool('project.test_gate_status', { projectId: PROJECT_ID, requirement: 'all' });
  console.log(JSON.stringify(back, null, 2).slice(0, 1500));
  process.exit(0);
}

const batches = [];
for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

console.log(`items: ${items.length} in ${batches.length} batch(es) of up to ${BATCH}`);
console.log(`payload: ${(JSON.stringify(items).length / 1024).toFixed(0)} KB total`);
console.log(`target: ${MCP_URL}  project ${PROJECT_ID}  spec ${SPEC_ID}`);
if (dryRun) { console.log('--dry-run: nothing sent'); process.exit(0); }

let filed = 0;
for (const [n, batch] of batches.entries()) {
  const kb = (JSON.stringify(batch).length / 1024).toFixed(0);
  process.stdout.write(`  batch ${n + 1}/${batches.length} (${batch.length} items, ${kb} KB) ... `);
  try {
    const r = await callTool('project.upsert_test_plan', {
      projectId: PROJECT_ID,
      specId: SPEC_ID,
      source: 'ai',
      items: batch,
    });
    filed += batch.length;
    console.log(`ok  ${JSON.stringify(r).slice(0, 200)}`);
  } catch (err) {
    console.log('FAILED');
    console.error(`    ${err.message}`);
    console.error(`    filed ${filed} item(s) before this batch; re-running is safe (matched on itemKey).`);
    process.exit(1);
  }
}
console.log(`\nfiled ${filed}/${items.length} items`);
