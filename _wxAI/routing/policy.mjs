// Provider policy (SPEC-143 FR-007, FR-009; contract C2). Amendment A: Anthropic only.
//
// checkRoute({ provider, route, model, root, difficulty, command, taskid, log })
//   -> { allowed, fallbackModel, reason }
//
//   Every run is a Claude model on the official Claude client. A provider that is not Anthropic
//   (ids starting "anthropic-"), any route other than "official", or a model that is not a Claude
//   model is refused; no setting can lift it (OmniRoute and allowedProviders were removed by
//   Amendment A). The Claude subscription in particular never leaves the official client (FR-009).
//   A refused route returns fallbackModel = the Claude model of the task's own tier (from the tier
//   table; never a non-Anthropic model) and logs a `refusal` event to decisions/routing-log.jsonl.
//   With no difficulty and no command the fallback is the easy tier, the cheapest Claude tier.
//
// assertSubscriptionOfficial({ provider, route }) throws when the pair would put the Claude
// subscription through anything but the official client. validateRunRecord(record) reports the
// same rules, plus C1 enum checks, for a run record.
//
// This module only reads settings and appends to the routing log.

import { appendRoutingEvent, isClaudeModel, isTier, kitDefaults, resolveTier } from './tiers.mjs';

export const ROUTES = Object.freeze(['official']);
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
  else if (command) tier = resolveTier({ command, root, log: false }).tier;
  const model = resolveTier({ difficulty: tier, root, log: false }).model;
  return isClaudeModel(model) ? model : kit.tiers[tier];
}

const RULE = 'Anthropic only: a Claude model on the official Claude client (FR-007, Amendment A)';

export function checkRoute({ provider, route, model = null, root, difficulty, command = null, taskid = null, log = true } = {}) {
  const p = norm(provider);
  const r = norm(route);
  const m = typeof model === 'string' ? model.trim() : '';

  const refuse = (reason) => {
    const fallbackModel = claudeFallback({ difficulty, command, root });
    if (log) {
      appendRoutingEvent(root, {
        event: 'refusal',
        taskid,
        command,
        from: `${m ? `${m} on ` : ''}${p || '(none)'}${r ? ` via ${r}` : ''}`,
        to: fallbackModel,
        reason,
        evidence: RULE,
      });
    }
    return { allowed: false, fallbackModel, reason };
  };

  if (!p) return refuse('no provider named');
  if (breaksSubscriptionRule({ provider: p, route: r })) {
    return refuse(`${SUBSCRIPTION_PROVIDER} runs only on the official Claude client, never through ${r} (FR-009)`);
  }
  if (!isAnthropicProvider(p)) return refuse(`${p} is not an Anthropic provider; every run is on Claude`);
  if (r && !ROUTES.includes(r)) return refuse(`route "${r}" is not the official Claude client`);
  if (m && !isClaudeModel(m)) return refuse(`${m} is not a Claude model`);
  return { allowed: true, fallbackModel: null, reason: `${p} on the official Claude client` };
}

/**
 * Check one C1 run record. Returns { valid, violations: [..] }.
 * A record with provider anthropic-subscription and any route other than official is a violation,
 * as is any route other than official and any provider that is not Anthropic.
 */
export function validateRunRecord(record) {
  const violations = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { valid: false, violations: ['record is not an object'] };
  if (norm(record.provider) === SUBSCRIPTION_PROVIDER && norm(record.route) !== 'official') {
    violations.push(`FR-009: provider ${SUBSCRIPTION_PROVIDER} must have route official, found ${JSON.stringify(record.route ?? null)}`);
  }
  if (record.route !== undefined && record.route !== null && !ROUTES.includes(record.route)) {
    violations.push(`route must be official, found ${JSON.stringify(record.route)}`);
  }
  if (record.provider !== undefined && record.provider !== null && !isAnthropicProvider(record.provider)) {
    violations.push(`provider must be Anthropic, found ${JSON.stringify(record.provider)}`);
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
      route: arg('--route'),
      model: arg('--model') ?? null,
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
