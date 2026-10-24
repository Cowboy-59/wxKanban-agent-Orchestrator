// Provider policy (SPEC-143 FR-007, FR-009; contract C2).
//
// checkRoute({ provider, kind, root, route, difficulty, command, taskid, log })
//   -> { allowed, fallbackModel, reason }
//
//   Anthropic providers (ids starting "anthropic-") are always allowed, with one exception that no
//   setting can lift: anthropic-subscription runs only on the official client, so any route other
//   than "official" (OmniRoute in particular) is refused (FR-009).
//   Any other provider is allowed only when decisions/settings.yaml allowedProviders lists it with
//   the kind of work (docs | scaffolding | synthetic-tests | code). Empty or missing = Anthropic only.
//   A refused route returns fallbackModel = the Claude model of the task's own tier (from the tier
//   table; never a non-Anthropic model) and logs a `refusal` event to decisions/routing-log.jsonl.
//   With no difficulty and no command the fallback is the easy tier, the cheapest Claude tier.
//
// assertSubscriptionOfficial({ provider, route }) throws when the pair would put the Claude
// subscription through anything but the official client. validateRunRecord(record) reports the
// same rule, plus C1 enum checks, for a run record.
//
// This module only reads settings. Nothing in it can add to allowedProviders.

import { appendRoutingEvent, isTier, kitDefaults, readRoutingSettings, resolveTier } from './tiers.mjs';

export const WORK_KINDS = Object.freeze(['docs', 'scaffolding', 'synthetic-tests', 'code']);
export const ROUTES = Object.freeze(['official', 'omniroute']);
export const RUN_KINDS = Object.freeze(['session', 'subagent', 'command']);
export const SUBSCRIPTION_PROVIDER = 'anthropic-subscription';

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export function isAnthropicProvider(provider) {
  return /^anthropic-[a-z0-9][a-z0-9-]*$/.test(norm(provider));
}

/** True when this provider and route would put the Claude subscription off the official client. */
export function breaksSubscriptionRule({ provider, route }) {
  if (norm(provider) !== SUBSCRIPTION_PROVIDER) return false;
  const r = norm(route);
  return r !== '' && r !== 'official';
}

export function assertSubscriptionOfficial({ provider, route } = {}) {
  if (breaksSubscriptionRule({ provider, route })) {
    throw new Error(`FR-009: provider ${SUBSCRIPTION_PROVIDER} runs only on the official Claude client, never through route "${route}"`);
  }
  return true;
}

/** The Claude model a refused task falls back to: its own tier, never a non-Anthropic model. */
export function claudeFallback({ difficulty, command, root } = {}) {
  const kit = kitDefaults();
  let tier = 'easy';
  if (isTier(difficulty)) tier = difficulty;
  else if (command) tier = resolveTier({ command, root }).tier;
  const model = resolveTier({ difficulty: tier, root }).model;
  return /^claude-/i.test(model) ? model : kit.tiers[tier];
}

function describeAllowed(list) {
  if (!list.length) return 'allowedProviders is empty (Anthropic only)';
  return `allowedProviders: ${list.map((e) => `${e.provider} [${e.kinds.join(', ') || 'no kinds'}]`).join('; ')}`;
}

export function checkRoute({ provider, kind, root, route, difficulty, command = null, taskid = null, log = true } = {}) {
  const p = norm(provider);
  const k = norm(kind);
  const r = norm(route);
  const settings = readRoutingSettings(root);
  const allowedList = settings.allowedProviders;

  const refuse = (reason, evidence) => {
    const fallbackModel = claudeFallback({ difficulty, command, root });
    if (log) {
      appendRoutingEvent(root, {
        event: 'refusal',
        taskid,
        command,
        from: `${p || '(none)'}${r ? ` via ${r}` : ''}`,
        to: fallbackModel,
        reason,
        evidence,
      });
    }
    return { allowed: false, fallbackModel, reason };
  };

  if (!p) return refuse('no provider named', 'provider is empty');
  if (r && !ROUTES.includes(r)) return refuse(`unknown route "${r}"`, `routes are ${ROUTES.join(', ')}`);
  if (breaksSubscriptionRule({ provider: p, route: r })) {
    return refuse(`${SUBSCRIPTION_PROVIDER} runs only on the official Claude client, never through ${r} (FR-009)`, 'fixed rule; no setting changes it');
  }
  if (isAnthropicProvider(p)) return { allowed: true, fallbackModel: null, reason: `${p} is an Anthropic provider` };

  if (!WORK_KINDS.includes(k)) {
    return refuse(`${p} is not Anthropic and the kind of work "${kind ?? ''}" is not one of ${WORK_KINDS.join(', ')}`, describeAllowed(allowedList));
  }
  const entry = allowedList.find((e) => e.provider === p && e.kinds.includes(k));
  if (!entry) {
    const reason = settings.readable
      ? `${p} is not allowed for ${k} work by this project's allowedProviders`
      : `decisions/settings.yaml could not be read, so only Anthropic is allowed`;
    return refuse(reason, describeAllowed(allowedList));
  }
  return { allowed: true, fallbackModel: null, reason: `${p} is allowed for ${k} work by this project's allowedProviders` };
}

/**
 * Check one C1 run record. Returns { valid, violations: [..] }.
 * A record with provider anthropic-subscription and any route other than official is a violation.
 */
export function validateRunRecord(record) {
  const violations = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { valid: false, violations: ['record is not an object'] };
  if (norm(record.provider) === SUBSCRIPTION_PROVIDER && norm(record.route) !== 'official') {
    violations.push(`FR-009: provider ${SUBSCRIPTION_PROVIDER} must have route official, found ${JSON.stringify(record.route ?? null)}`);
  }
  if (record.route !== undefined && record.route !== null && !ROUTES.includes(record.route)) {
    violations.push(`route must be one of ${ROUTES.join(', ')}, found ${JSON.stringify(record.route)}`);
  }
  if (record.difficulty !== undefined && record.difficulty !== null && !isTier(record.difficulty)) {
    violations.push(`difficulty must be easy, moderate or heavy, found ${JSON.stringify(record.difficulty)}`);
  }
  if (record.kind !== undefined && record.kind !== null && !RUN_KINDS.includes(record.kind)) {
    violations.push(`kind must be one of ${RUN_KINDS.join(', ')}, found ${JSON.stringify(record.kind)}`);
  }
  return { valid: violations.length === 0, violations };
}

function main(argv) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  try {
    const out = checkRoute({
      provider: arg('--provider'),
      kind: arg('--kind'),
      route: arg('--route'),
      difficulty: arg('--difficulty'),
      command: arg('--command') ?? null,
      taskid: arg('--task') ?? null,
      root: arg('--root') ?? process.cwd(),
      log: !argv.includes('--no-log'),
    });
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(out.allowed ? 0 : 1);
  } catch (e) {
    process.stderr.write(`policy: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/policy.mjs')) main(process.argv.slice(2));
