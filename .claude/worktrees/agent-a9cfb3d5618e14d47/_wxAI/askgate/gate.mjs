// The Ask Gate (SPEC-142 FR-005, FR-006, FR-011, FR-013, FR-014, FR-017).
//
// One flow for every intercept point (the AskUserQuestion hook, the Stop hook, G.O.D.):
//
//   search the Decision Ledger (contract C2) inside the 2000 ms budget
//     answered  -> enforce: the question is not sent; the agent gets the decision text + ID
//     not       -> classify (FR-009)
//                    assumption -> enforce: the agent picks the default and continues;
//                                  appended to decisions/assumptions.yaml (contract C5)
//                    blocker    -> the question reaches a person (route.mjs picks the queue,
//                                  the bridge room, or plain pass-through)
//   observe mode (the default) never stops anything: it logs what WOULD have happened.
//
// Every intercepted question appends exactly one line to decisions/gate-log.jsonl (C4). A
// blocker handed to route.mjs is logged there, so it is not logged here as well.
// The gate never writes decisions/ledger.yaml, and never answers "allow": a question it lets
// through goes on through the normal permission flow.
//
// Modes and the threshold are read from decisions/settings.yaml on every call, so switching
// observe/enforce needs no reinstall (FR-013).

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { explain } from './classify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The whole decision has 2 s (SC-4). The memory service gets 1.5 s of it, so a service that never
// replies still leaves time for node to start and the file search to answer (measured: a 2000 ms
// service budget made a black-holed service take 2.1-2.7 s per decision).
export const DECISION_BUDGET_MS = 2000;
export const BUDGET_MS = 1500;
export const ASSUMPTIONS_REL = join('decisions', 'assumptions.yaml');

// ---------- where the decisions live ----------

/**
 * The main repository root for `root`. In a git worktree `.git` is a file naming
 * <main>/.git/worktrees/<name>; the ledger is read from <main>, never the worktree copy (FR-008).
 * Read from the files only (no git process).
 */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function mainRepoRootOf(root) {
  let dir = resolve(root);
  for (;;) {
    const dotGit = join(dir, '.git');
    if (existsSync(dotGit)) {
      try {
        if (statSync(dotGit).isDirectory()) return dir;
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
        if (m) {
          const gitdir = resolve(dir, m[1].trim());
          const w = gitdir.replace(/\\/g, '/').match(/^(.*)\/\.git\/worktrees\/[^/]+\/?$/);
          if (w) return resolve(w[1]);
        }
      } catch {
        // unreadable .git: fall back to the directory itself
      }
      return dir;
    }
    const up = dirname(dir);
    if (up === dir) return resolve(root);
    dir = up;
  }
}
// [SCOPE 142 / T008] END

// ---------- dependencies (Ledger and Memory areas), injectable for tests ----------

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
async function importLocal(name) {
  const file = join(HERE, name);
  if (!existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}
// [SCOPE 142 / T008] END

/**
 * The search backends in the order search() tries them. OpenViking is registered only when the
 * developer has configured it (OPENVIKING_URL, or a key in ~/.wxai/openviking.key); otherwise the
 * file backend alone is used and the status line says the service is not installed.
 */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export async function defaultBackends(root, { env = process.env, home = homedir() } = {}) {
// [SCOPE 142 / T008] END
  const file = await importLocal('file.mjs');
  const fileBackend = file?.fileBackend ?? file?.default ?? null;
  const list = [];
  const configured = Boolean(env.OPENVIKING_URL) || existsSync(join(home, '.wxai', 'openviking.key'));
  if (configured) {
    const ov = await importLocal('openviking.mjs');
    if (typeof ov?.createOpenVikingBackend === 'function') list.push(ov.createOpenVikingBackend({ root }));
  }
  if (fileBackend) list.push(fileBackend);
  return list;
}

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export async function loadDeps(overrides = {}) {
// [SCOPE 142 / T008] END
  const need = (mod, key, file) => {
    const fn = mod?.[key];
    if (typeof fn !== 'function') throw new Error(`${file} is missing or does not export ${key}()`);
    return fn;
  };
  const out = { ...overrides };
  if (!out.search) out.search = need(await importLocal('search.mjs'), 'search', 'search.mjs');
  if (!out.readSettings) out.readSettings = need(await importLocal('settings.mjs'), 'readSettings', 'settings.mjs');
  if (!out.logOutcome) out.logOutcome = need(await importLocal('log.mjs'), 'logOutcome', 'log.mjs');
  if (out.routeBlocker === undefined) {
    const route = await importLocal('route.mjs');
    out.routeBlocker = typeof route?.routeBlocker === 'function' ? route.routeBlocker : null;
  }
  return out;
}

// ---------- the budget (FR-017) ----------

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function withBudget(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
// [SCOPE 142 / T008] END

/**
 * Search inside the budget. search() itself gives a non-file backend the budget; this is the
 * gate's own guard on top, so a backend that hangs (or a search that ignores its budget) can
 * never hold the question: past the budget the file backend alone answers, fellBack: true.
 */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export async function searchWithinBudget(question, { search, root, mainRepoRoot, threshold, backends, budgetMs = BUDGET_MS, globalRoot }) {
// [SCOPE 142 / T008] END
  const started = Date.now();
  const fileOnly = (backends ?? []).filter((b) => b?.name === 'file');
  const hasService = (backends ?? []).some((b) => b?.name && b.name !== 'file');
  const opts = { root, mainRepoRoot, threshold, backends, budgetMs, ...(globalRoot ? { globalRoot } : {}) };
  if (!hasService) return { ...(await search(question, opts)), serviceRegistered: false };
  try {
    return { ...(await withBudget(Promise.resolve(search(question, opts)), budgetMs)), serviceRegistered: true };
  } catch {
    const r = await search(question, { ...opts, backends: fileOnly });
    return { ...r, backend: 'file', fellBack: true, elapsedMs: Date.now() - started, serviceRegistered: true };
  }
}

/** The one-line health status (US6, FR-017). */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function statusLine(searches, mode) {
  const list = searches.filter(Boolean);
  let health;
  if (list.some((s) => s.fellBack)) health = 'memory service down (file fallback)';
  else if (list.some((s) => s.serviceRegistered && s.backend !== 'file')) health = 'memory service up';
  else health = 'memory service not installed (file search)';
  return `Ask Gate: ${health} [${mode}]`;
}
// [SCOPE 142 / T008] END

// ---------- who answers ----------

/**
 * True only in an unattended run with nobody to answer: WXAI_UNATTENDED=1 or the SCOPE-137 marker
 * (wxG-O-D --create), and not a Remote Session Bridge run (its questions reach the room). Anything
 * else has a person present, so the hooks pass assume: false and an uncovered question goes to them
 * instead of being answered on their behalf (found live: a wxBrainstorm close approved its own
 * summary). The marker is read without a session, so this never binds it (the impact hook does).
 */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export async function nobodyToAnswer(root, env = process.env) {
  if (env.WXAI_REMOTE === '1') return false;
  if (env.WXAI_UNATTENDED === '1') return true;
  const file = join(HERE, '..', 'impact', 'lib', 'unattended.mjs');
  if (!existsSync(file)) return false;
  try {
    const { unattendedState } = await import(pathToFileURL(file).href);
    const s = unattendedState(root, null, { env });
    return Boolean(s?.unattended && !s.remote);
  } catch {
    return false;
  }
}
// [SCOPE 142 / T009] END

// ---------- assumptions (FR-011, contract C5) ----------

const yamlString = (v) => (v === null || v === undefined ? 'null' : JSON.stringify(String(v)));

/** Append one assumption. Agents may write this file; the gate never touches the ledger. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function appendAssumption(root, { time, question, defaultChosen, agent }) {
// [SCOPE 142 / T008] END
  const file = join(root, ASSUMPTIONS_REL);
  mkdirSync(dirname(file), { recursive: true });
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const sep = prev.length && !prev.endsWith('\n') ? '\n' : '';
  const block = [
    `- time: ${yamlString(time)}`,
    `  question: ${yamlString(question)}`,
    `  defaultChosen: ${yamlString(defaultChosen)}`,
    `  agent: ${yamlString(agent)}`,
    '  reviewed: false',
  ].join('\n');
  appendFileSync(file, `${sep}${block}\n`, 'utf8');
  return file;
}

/** The option the agent itself marked as recommended, else its first option, else null. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function defaultOption(options) {
  const labels = (Array.isArray(options) ? options : []).map((o) => (typeof o === 'string' ? o : o?.label)).filter((l) => typeof l === 'string' && l.trim());
  return labels.find((l) => /recommended/i.test(l)) ?? labels[0] ?? null;
}
// [SCOPE 142 / T008] END

// ---------- the gate ----------

/**
 * Search the question and any other phrasings of it (the Stop hook passes the question sentence's
 * neighbors: its line, its paragraph, the whole message). The best answered hit wins; when none
 * answers, the question's own result stands, so context and classification follow the question.
 * Once the service has fallen back, the rest go to the file backend alone, to stay in the budget.
 */
export async function searchCandidates(text, others, opts) {
  const primary = await searchWithinBudget(text, opts);
  const seen = new Set([text.toLowerCase()]);
  let best = primary.status === 'answered' && primary.hit ? primary : null;
  let fellBack = Boolean(primary.fellBack);
  for (const raw of Array.isArray(others) ? others : []) {
    const alt = typeof raw === 'string' ? raw.trim() : '';
    if (!alt || seen.has(alt.toLowerCase())) continue;
    seen.add(alt.toLowerCase());
    const backends = fellBack ? (opts.backends ?? []).filter((b) => b?.name === 'file') : opts.backends;
    const r = await searchWithinBudget(alt, { ...opts, backends });
    fellBack = fellBack || Boolean(r.fellBack);
    if (r.status === 'answered' && r.hit && (!best || r.hit.score > best.hit.score)) best = r;
  }
  return { ...(best ?? primary), fellBack };
}

/**
 * Run the gate over the questions of one intercepted call.
 *
 *   items: [ { text, options?, detectedBy? } ]
 *   ctx:   { root, session, intercept: 'tool'|'stop'|'god', agent, conversion, budgetMs, globalRoot, deps, now, assume }
 *          assume: false lets an uncovered non-blocker through instead of assuming it (default true)
 *
 * Returns { mode, decision: 'stop'|'let-through', reason, status, results }:
 *   'stop'        enforce mode and nothing needs a person (or a blocker was parked in the queue);
 *                 `reason` is what the agent is told instead of the developer seeing the question.
 *   'let-through' the question(s) reach the developer (observe mode, or a blocker present).
 */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
// MODIFIED-BY: [SCOPE 142 / T009] — ctx.assume: false holds an uncovered question for the person present
export async function runGate(items, ctx = {}) {
// [SCOPE 142 / T008] END
  const root = resolve(ctx.root ?? process.cwd());
  const main = mainRepoRootOf(root);
  const deps = await loadDeps(ctx.deps ?? {});
  const settings = deps.readSettings(main);
  const mode = settings?.gate?.mode === 'enforce' ? 'enforce' : 'observe';
  const threshold = typeof settings?.gate?.matchThreshold === 'number' ? settings.gate.matchThreshold : 0.75;
  const backends = deps.backends ?? (await defaultBackends(main));
  const now = ctx.now ?? (() => new Date().toISOString());
  const session = ctx.session ?? null;
  const intercept = ctx.intercept ?? 'tool';
  const agent = ctx.agent ?? process.env.WXAI_AGENT_NAME ?? (session ? `claude-code session ${session}` : 'claude-code');
  const conversion = ctx.conversion ?? process.env.WXAI_CONVERSION === '1';

  const list = (Array.isArray(items) ? items : []).length ? items : [{ text: '' }];
  const results = [];
  for (const item of list) {
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    let s = null;
    let searchError = null;
    if (text) {
      try {
        s = await searchCandidates(text, item?.searchTexts, { search: deps.search, root, mainRepoRoot: main, threshold, backends, budgetMs: ctx.budgetMs ?? BUDGET_MS, globalRoot: ctx.globalRoot });
      } catch (e) {
        searchError = e instanceof Error ? e.message : String(e);
      }
    }
    const answered = s?.status === 'answered' && s.hit;
    const relevant = (s?.context ?? []).filter((c) => typeof c?.score === 'number');
    const verdict = answered ? null : explain(text, { conversion, context: relevant, threshold });
    if (searchError) {
      // A search that failed answers nothing and proves nothing: fail closed.
      verdict.reasons.push({ rule: 'unsure', match: `the ledger search failed: ${searchError}` });
      verdict.class = 'blocker';
    }
    results.push({
      item, text, search: s, verdict,
      class: verdict?.class ?? null,
      ledgerId: answered ? s.hit.id : null,
      score: answered ? s.hit.score : relevant.length ? Math.max(...relevant.map((c) => c.score)) : null,
    });
  }

  const status = statusLine(results.map((r) => r.search), mode);
  const write = (r, outcome, reason, extra = {}) => {
    r.outcome = { outcome, class: r.class, ledgerId: r.ledgerId, score: r.score, reason };
    const event = {
      time: now(), session, intercept, question: r.text, outcome, class: r.class, ledgerId: r.ledgerId, score: r.score,
      wouldHaveAnswered: Boolean(r.ledgerId), mode, ...extra,
    };
    if (r.item?.detectedBy) event.detectedBy = r.item.detectedBy;
    deps.logOutcome(main, event);
  };

  // Observe (FR-013): nothing is stopped; each question logged with what would have happened.
  if (mode === 'observe') {
    for (const r of results) write(r, 'observed', r.ledgerId ? `would answer from ${r.ledgerId}` : `would be ${r.class}`);
    return { mode, decision: 'let-through', reason: null, status, results };
  }

  // Enforce. Blockers first: they decide whether the call stops or reaches the developer.
  const blockers = results.filter((r) => r.class === 'blocker');
  // ctx.assume === false (the Stop hook when a person is present): an uncovered question is not
  // assumed; it reaches that person. Only a ledger answer stops it (FR-006).
  const held = ctx.assume === false ? results.filter((r) => r.class === 'assumption') : [];
  let parked = false;
  for (const r of blockers) {
    let routed = null;
    if (deps.routeBlocker) {
      try {
        routed = await deps.routeBlocker(main, { outcome: 'passed-through', class: 'blocker', ledgerId: null, score: r.score, reason: 'blocker' }, { question: r.text, session, intercept, unit: process.env.WXAI_UNIT ?? null }, deps.routeDeps ?? {});
      } catch (e) {
        routed = { route: 'pass-through', error: e instanceof Error ? e.message : String(e) };
      }
    }
    r.route = routed;
    if (routed?.route === 'queue') {
      parked = true;
      r.outcome = { outcome: 'queued', class: 'blocker', ledgerId: null, score: r.score, reason: `parked as ${routed.dqId}` };
    } else {
      r.outcome = { outcome: 'passed-through', class: 'blocker', ledgerId: null, score: r.score, reason: 'needs a person' };
    }
    // route.mjs logged it; without route.mjs (or when it failed before logging) the gate logs it.
    if (!routed || routed.error) write(r, r.outcome.outcome, r.outcome.reason);
  }

  const stop = (blockers.length === 0 || parked) && held.length === 0;
  for (const r of results) {
    if (r.class === 'blocker') continue;
    if (!stop) {
      const why = held.includes(r) ? 'not assumed: a person is present to answer' : 'asked anyway: a question in the same call needs the developer';
      write(r, 'passed-through', r.ledgerId ? `${why} (${r.ledgerId} answers this one)` : why);
      continue;
    }
    if (r.ledgerId) {
      write(r, 'answered', `answered from ${r.ledgerId}`);
    } else {
      r.defaultChosen = defaultOption(r.item?.options) ?? 'not stated: the agent states the default it chose in its next message';
      write(r, 'assumed', 'assumption: most reasonable default');
      try {
        appendAssumption(main, { time: now(), question: r.text, defaultChosen: r.defaultChosen, agent });
      } catch {
        // the gate-log line above still records the assumption
      }
    }
  }

  if (!stop) return { mode, decision: 'let-through', reason: null, status, results, note: letThroughNote(results) };
  return { mode, decision: 'stop', reason: stopReason(results), status, results };
}

/**
 * Questions that go through to the developer without the gate's full flow: the gate could not run
 * (a module missing, settings unreadable), or the Stop hook's repeat guard let a question through.
 * This still writes the one log line each of them is owed (FR-014), best effort.
 */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export async function logUnchecked(items, ctx, note) {
  try {
    const main = mainRepoRootOf(resolve(ctx.root ?? process.cwd()));
    const logOutcome = ctx.deps?.logOutcome ?? (await importLocal('log.mjs'))?.logOutcome;
    if (typeof logOutcome !== 'function') return false;
    let mode = 'unknown';
    try {
      const readSettings = ctx.deps?.readSettings ?? (await importLocal('settings.mjs'))?.readSettings;
      mode = readSettings(main)?.gate?.mode === 'enforce' ? 'enforce' : 'observe';
    } catch {
      // settings unreadable: the line still records the question
    }
    const list = (Array.isArray(items) ? items : []).length ? items : [{ text: '' }];
    for (const item of list) {
      logOutcome(main, {
        time: new Date().toISOString(), session: ctx.session ?? null, intercept: ctx.intercept ?? 'tool',
        question: typeof item?.text === 'string' ? item.text.trim() : '', outcome: 'passed-through', class: 'blocker',
        ledgerId: null, score: null, wouldHaveAnswered: false, mode, note: String(note),
      });
    }
    return true;
  } catch {
    return false;
  }
}
// [SCOPE 142 / T008] END

// ---------- what the agent is told ----------

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function stopReason(results) {
  const lines = ['Ask Gate: this question was not sent to the developer.'];
  for (const r of results) {
    lines.push('', `Question: ${r.text || '(empty)'}`);
    if (r.outcome?.outcome === 'answered') {
      const s = r.search.hit;
      lines.push(`Answered by ${s.id} (${s.tier} decision, match ${Number(s.score).toFixed(2)}). The owner approved this decision:`);
      lines.push(s.text);
    } else if (r.outcome?.outcome === 'assumed') {
      lines.push('No approved decision covers this, and it is not a blocker. Choose the most reasonable default and continue.');
      if (defaultOption(r.item?.options)) lines.push(`Default: ${r.defaultChosen} (the option you recommended, or your first option).`);
      lines.push('It is logged in decisions/assumptions.yaml for the owner to review.');
    } else if (r.outcome?.outcome === 'queued') {
      lines.push(`This needs the owner. It is parked as ${r.route.dqId} in the decision queue${r.route.alsoRoom ? ' and sent to the bridge room' : ''}.`);
      lines.push('Save your state and stop work on this unit. G.O.D. resumes it when the owner answers. Do not decide it yourself.');
    }
  }
  lines.push('', 'Continue the task. In your next message, state in one line why each decision applies to your question (cite its ID), and which default you chose for each assumption.');
  lines.push('If a decision clearly does not apply, say so plainly to the developer instead of asking the same question again.');
  return lines.join('\n');
}
// [SCOPE 142 / T008] END

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function letThroughNote(results) {
  const answered = results.filter((r) => r.ledgerId);
  if (!answered.length) return null;
  return ['Ask Gate: the developer is being asked because a question in this call needs a person.', ...answered.map((r) => `Already decided: "${r.text}" is answered by ${r.ledgerId}:\n${r.search.hit.text}`)].join('\n');
}
// [SCOPE 142 / T008] END
